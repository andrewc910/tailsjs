import { Configuration } from "../core/configuration.ts";
import { APIModules, APIRoute, APIRoutes } from "../types.ts";
import { Router as OakRouter } from "../deps.ts";
import { setMiddleware, setStaticMiddleware } from "./utils.ts";
import { Context } from "../deps.ts";
import { path } from "../std.ts";

export default class APIRouter {
  readonly router: OakRouter;
  private readonly config: Configuration;
  private readonly apiModules: APIModules;

  constructor(
    config: Configuration,
    apiModules: APIModules,
  ) {
    this.config = config;
    this.apiModules = apiModules;
    this.router = new OakRouter();
  }

  setRoutes(apiRoutes: APIRoutes) {
    setStaticMiddleware(this.router);
    setMiddleware(apiRoutes.middleware, this.router);

    apiRoutes.routes.forEach((route) => {
      switch (route.httpMethod) {
        case "DELETE":
          this.handleDelete(route);
          break;
        case "GET":
          this.handleGet(route);
          break;
        case "HEAD":
          this.handleHead(route);
          break;
        case "OPTIONS":
          this.handleOptions(route);
          break;
        case "PATCH":
          this.handlePatch(route);
          break;
        case "POST":
          this.handlePost(route);
          break;
        case "PUT":
          this.handlePut(route);
          break;
      }
    });
  }

  private handleDelete(route: APIRoute) {
    const fetchModule = this.fetchModule.bind(this);
    const { method, path } = route;

    this.router.delete(path, async (context: Context) => {
      const module = await fetchModule(route, path);
      const controller = new module();

      context.response.type = "application/json";
      context.response.body = controller[method]();
    });
  }

  private handleGet(route: APIRoute) {
    const fetchModule = this.fetchModule.bind(this);
    const { method, path } = route;

    this.router.get(path, async (context: Context) => {
      const module = await fetchModule(route, path);
      const controller = new module();

      context.response.type = "application/json";
      context.response.body = controller[method]();
    });
  }

  private handleHead(route: APIRoute) {
    const fetchModule = this.fetchModule.bind(this);
    const { method, path } = route;

    this.router.head(path, async (context: Context) => {
      const module = await fetchModule(route, path);
      const controller = new module();

      context.response.type = "application/json";
      context.response.body = controller[method]();
    });
  }

  private handleOptions(route: APIRoute) {
    const fetchModule = this.fetchModule.bind(this);
    const { method, path } = route;

    this.router.options(path, async (context: Context) => {
      const module = await fetchModule(route, path);
      const controller = new module();

      context.response.type = "application/json";
      context.response.body = controller[method]();
    });
  }

  private handlePatch(route: APIRoute) {
    const fetchModule = this.fetchModule.bind(this);
    const { method, path } = route;

    this.router.patch(path, async (context: Context) => {
      const module = await fetchModule(route, path);
      const controller = new module();

      context.response.type = "application/json";
      context.response.body = controller[method]();
    });
  }

  private handlePost(route: APIRoute) {
    const fetchModule = this.fetchModule.bind(this);
    const { method, path } = route;

    this.router.post(path, async (context: Context) => {
      const module = await fetchModule(route, path);
      const controller = new module();

      context.response.type = "application/json";
      context.response.body = controller[method]();
    });
  }

  private handlePut(route: APIRoute) {
    const fetchModule = this.fetchModule.bind(this);
    const { method, path } = route;

    this.router.put(path, async (context: Context) => {
      const module = await fetchModule(route, path);
      const controller = new module();

      context.response.type = "application/json";
      context.response.body = controller[method]();
    });
  }

  private async fetchModule(route: APIRoute, path: string) {
    let module = this.apiModules[path];
    if (!module) {
      module = await loadAPIModule(
        route,
        this.apiModules,
        this.config.buildDir,
      );
    }

    return module;
  }
}

export async function loadAPIModule(
  route: APIRoute,
  apiModules: APIModules,
  buildDir: string,
) {
  try {
    const pathname = path.join(
      buildDir,
      `/server/controllers/${route.controller}.js`,
    );
    const controller = (await import(pathname)).default;
    apiModules[route.path] = controller;
    return controller;
  } catch (error) {
    console.log(error);
    throw new Error(
      `Could not load api route module: ${route.controller}.`,
    );
  }
}
