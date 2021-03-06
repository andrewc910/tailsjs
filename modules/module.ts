import { ComponentType } from "../deps.ts";
import { dynamicImport } from "../utils/dynamicImport.ts";
import * as compiler from "../compiler/compiler.ts";
import { ensureTextFile } from "../fs.ts";
import { path } from "../std.ts";
import utils from "./utils.ts";
import { generateHTML } from "../utils/generateHTML.tsx";
import { Configuration } from "../core/configuration.ts";

interface Options {
  fullpath: string;
  isStatic: boolean;
  isPlugin: boolean;
  config: Configuration;
  html?: string;
  source?: string;
  map?: string;
  content?: string;
  writePath?: string;
}

export default class Module {
  /** The full path of the module */
  fullPath: string;

  /** The path of the module after `/src` */
  srcPath: string;

  /** `true` if this module is a static route */
  isStatic: boolean;

  /**
   * `true` if this module is a plugin module
   * such as `.css` files.
   */
  isPlugin: boolean;

  /** The contents from reading the file */
  content?: string;

  /** Source results from transpiling */
  source?: string;

  /** Source map from transpiling */
  map?: string;

  html?: string;

  writePath?: string;

  /** The function after importing */
  // deno-lint-ignore no-explicit-any
  private importedModule?: any;

  private readonly config: Configuration;

  constructor(
    {
      fullpath,
      html,
      source,
      map,
      content,
      isStatic,
      isPlugin,
      writePath,
      config,
    }: Options,
  ) {
    this.fullPath = fullpath;
    this.html = html;
    this.source = source;
    this.map = map;
    this.content = content;
    this.writePath = writePath;
    this.config = config;
    this.isPlugin = isPlugin || false;
    this.isStatic = isStatic || false;
    this.srcPath = utils.cleanKey(fullpath, config.rootDir);
  }

  get isPage() {
    return this.srcPath.includes("/pages");
  }

  get isAppMod() {
    return this.srcPath.includes("/app/");
  }

  get appPath() {
    return path.join(this.config.rootDir, "/app");
  }

  get isServerMod() {
    return this.srcPath.includes("/server/");
  }

  get serverPath() {
    return path.join(this.config.rootDir, "/server");
  }

  get htmlPath() {
    const dir = path.dirname(this.writePath as string);
    const filename = (this.writePath as string).replace(dir, "");

    return path
      .join(dir, filename)
      .replace(".js", ".html");
  }

  async module() {
    return this.importedModule || await this.import();
  }

  async import() {
    const pathname = path.join(this.config.buildDir, this.writePath as string);
    if (this.importedModule) {
      this.importedModule = await dynamicImport(
        "file://" + pathname,
      );
      return this.importedModule;
    }

    this.importedModule = await import("file://" + pathname);
    return this.importedModule;
  }

  async render(
    // deno-lint-ignore no-explicit-any
    App: ComponentType<any>,
    // deno-lint-ignore no-explicit-any
    Document: ComponentType<any>,
    // deno-lint-ignore no-explicit-any
    props: Record<string, any> = {},
  ) {
    if (!this.isPage) return;

    if (!this.importedModule) {
      await this.import();
    }

    const html = await generateHTML({
      App: App,
      Document: Document,
      Component: this.importedModule.default,
      props,
      reactWritePath: this.config.reactWritePath as string,
      reactServerWritePath: this.config.reactServerWritePath as string,
    });

    if (this.isStatic && this.config.mode !== "development") {
      this.html = html;
    }

    return html;
  }

  async fetchHTML(
    // deno-lint-ignore no-explicit-any
    App: ComponentType<any>,
    // deno-lint-ignore no-explicit-any
    Document: ComponentType<any>,
    // deno-lint-ignore no-explicit-any
    props: Record<string, any> = {},
  ) {
    return this.html || await this.render(
      App,
      Document,
      props,
    );
  }

  async transpile(): Promise<string> {
    const content = this.content as string;
    const module: Record<string, string> = {};
    module[this.fullPath] = content;
    let result;

    if (this.isPlugin) {
      result = await compiler.transform(module);
    } else {
      const transformedModule = await compiler.transform(module, {
        buildDir: this.config.buildDir,
        rootDir: this.config.rootDir,
        reactLocalPath: this.config.reactWritePath,
        reactDOMLocalPath: this.config.reactServerWritePath,
        isBuilding: this.config.isBuilding,
        reload: this.config.reload,
      });
      result = await compiler.transpile(transformedModule);
    }

    for (const key of Object.keys(result)) {
      const cleanedKey = utils.cleanKey(key, this.config.rootDir);

      this.writePath = path.join(cleanedKey);
      const module = result[key];

      if (typeof module === "string") {
        this.source = module;
      }

      if (typeof module === "object") {
        this.source = module.source;
        this.map = module.map;
      }
    }

    return utils.removeDir(
      this.writePath as string,
      this.config.buildDir,
    );
  }

  async retranspile() {
    await this.loadFile();
    await this.transpile();
    await this.write();
  }

  async write() {
    if (this.writePath) {
      const pathname = path.join(this.config.buildDir, this.writePath);
      await ensureTextFile(pathname, this.source as string);
      if (this.html) {
        await ensureTextFile(
          path.join(this.config.buildDir, this.htmlPath),
          this.html,
        );
      }
      if (this.map && !this.isServerMod) {
        await ensureTextFile(
          pathname + ".map",
          this.map,
        );
      }
    } else {
      throw new Error(`Module ${this.srcPath} has no writePath`);
    }
  }

  private async loadFile(): Promise<string> {
    const decoder = new TextDecoder("utf-8");
    const data = await Deno.readFile(this.fullPath);
    this.content = decoder.decode(data);
    return this.content;
  }
}
