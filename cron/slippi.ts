import { RateLimiter } from 'limiter';

// Slippi's API moved from gql-gateway-dot-slippi.uc.r.appspot.com to
// internal.slippi.gg at some point after Feb 2023, and the root query
// field was renamed getConnectCode -> getUser (which now returns the
// User directly, not nested under a `.user` field). The characters
// sub-selection also lost its `id` field. Verified against the current
// schema in August 2026 - see andross-ssbm/slippy-api for an
// independently-maintained client confirming the same shape.
export const getPlayerData = async (connectCode: string) => {
  const query = `fragment userProfilePage on User {
    displayName
    connectCode {
          code
          __typename
        }
      rankedNetplayProfile {
            id
            ratingOrdinal
            ratingUpdateCount
            wins
            losses
            dailyGlobalPlacement
            dailyRegionalPlacement
            continent
            characters {
                    character
                    gameCount
                    __typename
                  }
            __typename
          }
      __typename
  }

  query UserProfilePageQuery($cc: String, $uid: String) {
      getUser(connectCode: $cc, fbUid: $uid) {
            ...userProfilePage
            __typename
          }
  }`;

  const req = await fetch('https://internal.slippi.gg/graphql', {
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      operationName: 'UserProfilePageQuery',
      query,
      variables: { cc: connectCode, uid: connectCode },
    }),
    method: 'POST',
  });
  return req.json();
};

const limiter = new RateLimiter({ tokensPerInterval: 1, interval: 'second' });

export const getPlayerDataThrottled = async (connectCode: string) => {
  await limiter.removeTokens(1);
  return getPlayerData(connectCode);
};
