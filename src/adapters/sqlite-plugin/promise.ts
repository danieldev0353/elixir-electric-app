export const ensurePromise = (candidate: any): Promise<any> => {
  if (candidate instanceof Promise) {
    return candidate
  }

  throw `
    Expecting promises to be enabled.

    Electric SQL does not support disabling promises
    after electrifying your database client.
  `
}
