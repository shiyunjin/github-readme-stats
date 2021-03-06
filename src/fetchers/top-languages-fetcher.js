const { request, logger } = require("../common/utils");
const retryer = require("../common/retryer");
require("dotenv").config();

const fetcher = (variables, token) => {
  return request(
    {
      query: `
      query userInfo($login: String!,$endCursor: String) {
        user(login: $login) {
          # fetch only owner repos & not forks
          repositories(ownerAffiliations: OWNER, isFork: false, first: 100, after: $endCursor) {
            nodes {
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  size
                  node {
                    color
                    name
                  }
                }
              }
            }
            pageInfo{
                endCursor
                hasNextPage
            }
          }
        }
      }
      `,
      variables,
    },
    {
      Authorization: `bearer ${token}`,
    }
  );
};

async function fetchTopLanguages(username) {
  if (!username) throw Error("Invalid username");

  let hasNextPage = true;
  let cursor = null;
  let repoNodes = [];

  while (hasNextPage) {
    let res = await retryer(fetcher, { login: username, endCursor: cursor });

    if (res.data.errors) {
      logger.error(res.data.errors);
      throw Error(res.data.errors[0].message || "Could not fetch user");
    }
    cursor = res.data.data.user.repositories.pageInfo.endCursor;
    hasNextPage = res.data.data.user.repositories.pageInfo.hasNextPage;

    repoNodes.push(...res.data.data.user.repositories.nodes);
  }

  repoNodes = repoNodes
    .filter((node) => {
      return node.languages.edges.length > 0;
    })
    // flatten the list of language nodes
    .reduce((acc, curr) => curr.languages.edges.concat(acc), [])
    .sort((a, b) => b.size - a.size)
    .reduce((acc, prev) => {
      // get the size of the language (bytes)
      let langSize = prev.size;

      // if we already have the language in the accumulator
      // & the current language name is same as previous name
      // add the size to the language size.
      if (acc[prev.node.name] && prev.node.name === acc[prev.node.name].name) {
        langSize = prev.size + acc[prev.node.name].size;
      }
      return {
        ...acc,
        [prev.node.name]: {
          name: prev.node.name,
          color: prev.node.color,
          size: langSize,
        },
      };
    }, {});

  const topLangs = Object.keys(repoNodes)
    .reduce((result, key) => {
      result[key] = repoNodes[key];
      return result;
    }, {});

  return topLangs;
}

module.exports = fetchTopLanguages;
