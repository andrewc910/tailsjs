import { existsFileSync } from "../fs.ts";
import log from "../logger/logger.ts";
import { path } from "../std.ts";
import { Plugin, SSROptions } from "../types.ts";
import util, { reLocaleID } from "./utils.ts";

/**
* Config for Tails.js application. Handles loading & processing
* user config files.
*/
export class Configuration {
  /** `env` appends env variables (use `Deno.env.get(key)` to get an env variable) */
  env: Record<string, string>;

  /** `buildTarget` specifies the build target for **tsc** (possible values: '**ES2015**' - '**ES2020**' | '**ESNext**', default is **ES2015** for `production` and **ES2018** for `development`). */
  buildTarget: string;

  /** A list of plugin of PostCSS. */
  postcss: {
    plugins: (string | {
      name: string;
      // deno-lint-ignore no-explicit-any
      options: Record<string, any>;
    })[];
  };

  /** `baseUrl` specifies the path prefix for the application (default is '/'). */
  baseUrl: string;
  /** `defaultLocale` specifies the default locale of the application (default is '**en**'). */
  defaultLocale: string;
  /** The options for **SSR**. */
  ssr: boolean | SSROptions;
  /** `outputDir` specifies the output directory for `build` command (default is '**dist**'). */
  outputDir: string;
  /** A list of locales. */
  locales: Array<string>;
  /** Enable sourceMap in **production** mode (default is **false**). */
  sourceMap: boolean;
  /** A list of plugin. */
  plugins: Array<Plugin>;

  __file?: string;

  mainJSPath: string;

  isBuilding: boolean;

  /**
   * The path React was written to.
   * ModuleHandler sets this during compilation.
   */
  reactWritePath?: string;

  /**
   * The path ReactDOM was written to.
   * ModuleHandler sets this during compilation.
   */
  reactDOMWritePath?: string;

  /**
   * The path ReactDOMServer was written to.
   * ModuleHandler sets this during compilation.
   */
  reactServerWritePath?: string;

  /**
   * The path React-Refresh runtime was written to.
   * ModuleHandler sets this during compilation.
   */
  reactHmrWritePath?: string;

  /** The root dir of the users application */
  readonly rootDir: string;

  /** The app folder of the users application */
  readonly appDir: string;

  /** The server folder of the users application */
  readonly serverDir: string;

  readonly mode: "test" | "development" | "production";

  /** `reactUrl` specifies the **react** download URL
   * (default is 'https://esm.sh/react@17.0.1').
   */
  readonly reactUrl: string;

  /** `reactDomUrl` specifies the **react-dom** download URL
   * (default is 'https://esm.sh/react-dom@17.0.1').
   */
  readonly reactDomUrl: string;

  /** `reacHmrtUrl` specifies the **react HMR runtime** download URL
   * (default is 'https://esm.sh/react-refresh@0.8.3/runtime').
   */
  readonly reactHmrUrl: string;

  readonly importMap: Readonly<{ imports: Record<string, string> }>;

  readonly reload: boolean;

  // private readonly CONFIG_FILES: Array<string>;

  constructor(
    appDir: string,
    mode: "test" | "development" | "production",
    building: boolean = false,
    reload: boolean = false,
  ) {
    this.rootDir = path.resolve(appDir);
    this.appDir = path.join(this.rootDir, "app");
    this.serverDir = path.join(this.rootDir, "server");
    this.mode = mode;
    this.reload = reload;
    this.outputDir = "/dist";
    this.baseUrl = "/";
    this.mainJSPath = "/main.js";
    this.defaultLocale = "en";
    this.env = {};
    this.locales = [];
    this.buildTarget = mode === "development" ? "es2018" : "es2015";
    this.sourceMap = false;
    this.isBuilding = building;
    this.reactUrl = "https://esm.sh/react@17.0.1";
    this.reactDomUrl = "https://esm.sh/react-dom@17.0.1";
    this.reactHmrUrl = "https://esm.sh/react-refresh@0.8.3/runtime";
    this.plugins = [];
    this.postcss = {
      plugins: [
        "autoprefixer",
      ],
    };
    this.importMap = {
      imports: {},
    };
    this.ssr = {
      fallback: "_fallback.html",
    };
    // this.CONFIG_FILES = [
    //   `config/config.${mode}.ts`,
    //   `config/config.${mode}.js`,
    // ];
  }

  // TODO: This is bugged
  get isDev() {
    return (this.mode === "development" || !this.isBuilding);
  }

  /**
   * Main bundle all pages should fetch
   * Should pass routes to bootstrap but hard coded for now
   */
  get mainJS(): string {
    // TODO: Just move bootstrap code here
    return `
      import { bootstrap } from "./bootstrap.js";
      bootstrap()
      `;
  }

  get buildDir() {
    return path.join(
      this.rootDir,
      ".tails",
    );
  }

  /**
   * Returns the path that should be used
   * when fetch assets.
   */
  get assetDir(): string {
    if (this.isDev || this.isBuilding) {
      return path.join(this.rootDir, "src");
    }

    return path.join(this.rootDir, ".tails");
  }

  /**
   * Handles returning the full path of an asset
   * based on the current environment mode.
   *
   * @param asset - The asset to be fetched
   * Ex: `pages/_app.tsx` or `components/logo.tsx`
   */
  assetPath(asset: string): string {
    return path.join(this.assetDir, asset);
  }

  async loadConfig() {
    // deno-lint-ignore no-explicit-any
    const config: Record<string, any> = {};
    await this.loadImportMap();
    await this.loadConfigFiles(config);
    await this.setUserConfiguration(config);
  }

  private async loadImportMap() {
    const importMapFile = path.join(this.rootDir, "import_map.json");
    if (existsFileSync(importMapFile)) {
      const { imports } = JSON.parse(await Deno.readTextFile(importMapFile));
      Object.assign(
        this.importMap,
        { imports: Object.assign({}, this.importMap.imports, imports) },
      );
    }

    // TODO:
    // deno-lint-ignore no-explicit-any
    const { ALEPH_IMPORT_MAP } = globalThis as any;
    if (ALEPH_IMPORT_MAP) {
      const { imports } = ALEPH_IMPORT_MAP;
      Object.assign(
        this.importMap,
        { imports: Object.assign({}, this.importMap.imports, imports) },
      );
    }
  }

  // deno-lint-ignore no-explicit-any
  private async loadConfigFiles(config: Record<string, any>) {
    // for (const name of this.CONFIG_FILES) {
    //   const configPath = path.join(this.rootDir, name);
    //   if (existsFileSync(configPath)) {
    //     const { default: conf } = await import("file://" + configPath);

    //     if (util.isPlainObject(conf)) {
    //       Object.assign(config, conf);
    //       Object.assign(this, { __file: name });
    //     }
    //     break;
    //   }
    // }
    const configPath = path.join(this.rootDir, "config/config.development.ts");
    if (existsFileSync(configPath)) {
      const { default: conf } = await import("file://" + configPath);

      if (util.isPlainObject(conf)) {
        Object.assign(config, conf);
        Object.assign(this, { __file: "config.development.ts" });
      }
    } else {
      log.debug("Configuration file not found. Skipping");
    }
  }

  // deno-lint-ignore no-explicit-any
  private async setUserConfiguration(config: Record<string, any>) {
    // deno-lint-ignore no-explicit-any
    const { navigator } = globalThis as any;
    const {
      ouputDir,
      baseUrl,
      buildTarget,
      sourceMap,
      defaultLocale,
      locales,
      ssr,
      env,
      plugins,
      postcss,
    } = config;

    if (util.isNEString(ouputDir)) {
      Object.assign(this, { ouputDir: util.cleanPath(ouputDir) });
    }

    if (util.isNEString(baseUrl)) {
      Object.assign(this, { baseUrl: util.cleanPath(encodeURI(baseUrl)) });
    }

    if (/^es(20\d{2}|next)$/i.test(buildTarget)) {
      Object.assign(this, { buildTarget: buildTarget.toLowerCase() });
    }

    if (typeof sourceMap === "boolean") {
      Object.assign(this, { sourceMap });
    }

    if (util.isNEString(defaultLocale)) {
      navigator.language = defaultLocale;
      Object.assign(this, { defaultLocale });
    }

    if (util.isArray(locales)) {
      Object.assign(
        this,
        {
          locales: Array.from(
            new Set(locales.filter((l) => reLocaleID.test(l))),
          ),
        },
      );
      locales.filter((l) => !reLocaleID.test(l)).forEach((l) =>
        log.warn(`invalid locale ID '${l}'`)
      );
    }

    if (typeof ssr === "boolean") {
      Object.assign(this, { ssr });
    } else if (util.isPlainObject(ssr)) {
      const fallback = util.isNEString(ssr.fallback)
        ? util.ensureExt(ssr.fallback, ".html")
        : "404.html";
      const include = util.isArray(ssr.include)
        ? ssr.include.map((v) => util.isNEString(v) ? new RegExp(v) : v).filter(
          (v) => v instanceof RegExp,
        )
        : [];
      const exclude = util.isArray(ssr.exclude)
        ? ssr.exclude.map((v) => util.isNEString(v) ? new RegExp(v) : v).filter(
          (v) => v instanceof RegExp,
        )
        : [];
      const staticPaths = util.isArray(ssr.staticPaths)
        ? ssr.staticPaths.map((v) => util.cleanPath(v))
        : [];
      Object.assign(this, { ssr: { fallback, include, exclude, staticPaths } });
    }

    if (util.isPlainObject(env)) {
      Object.assign(this, { env });
    }

    if (util.isNEArray(plugins)) {
      Object.assign(this, { plugins });
    }

    if (util.isPlainObject(postcss) && util.isArray(postcss.plugins)) {
      Object.assign(this, { postcss });
    } else if (existsFileSync(path.join(this.rootDir, "postcss.config.json"))) {
      const text = await Deno.readTextFile(
        path.join(this.rootDir, "postcss.config.json"),
      );
      try {
        const postcss = JSON.parse(text);
        if (util.isPlainObject(postcss) && util.isArray(postcss.plugins)) {
          Object.assign(this, { postcss });
        }
      } catch (e) {
        log.warn("bad postcss.config.json", e.message);
      }
    }
  }
}
