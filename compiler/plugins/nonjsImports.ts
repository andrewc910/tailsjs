import { reDoubleQuotes, reHttp } from "../../core/utils.ts";
import { CompilerPlugin } from "../../types.ts";

/**
 * Handles converting non `.js` local import paths
 * to `.js`.
 */
const defaultPlugin: CompilerPlugin = {
  name: "nonjs-imports",
  test: /\.(jsx|mjs|tsx|ts?)/g,
  acceptHMR: true,
  resolve: (url: string) => {
    let transformedUrl;
    // TODO: Match remaining string types
    // || path.match(reSingleQuotes) || path.match(reBackTicks)
    const importURL = url.match(reDoubleQuotes);
    if (!importURL || !importURL[0]) return url;

    if (!importURL[0].match(reHttp)) {
      transformedUrl = url.replace(/\.(jsx|mjs|tsx|ts?)/g, ".js");
    }

    return transformedUrl || url;
  },
};

export default defaultPlugin;
