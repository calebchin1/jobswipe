/** A sign-out/sign-in cycle is a new boundary even when the account ID is unchanged. */
export function createSessionBoundary() {
  let version = 0;
  let userId: string | null = null;
  return {
    observe(event: string, nextUser: string | null) {
      if (nextUser !== userId || event === 'SIGNED_OUT' || event === 'SIGNED_IN') version++;
      userId = nextUser;
      return version;
    },
    get version() {
      return version;
    },
    key() {
      return userId === null ? null : `${userId}:${version}`;
    },
    assert(expected: number) {
      if (version !== expected) throw new Error('Your session changed. Refresh before continuing.');
    },
  };
}
