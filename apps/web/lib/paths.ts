export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const appPath = (path: string) => BASE_PATH + path;
