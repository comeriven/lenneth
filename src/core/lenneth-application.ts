import * as path from "path";
import * as Koa from "koa";
import * as bodyParser from "koa-bodyparser";
import { ILennthApplication } from "@interfaces";
import { Metadata } from "@common";
import { LENNETH_INTERCEPTOR_NAME, LENNETH_ERROR_NAME } from "@constants";
import { getClass, toAsyncMiddleware, toErrorAsyncMiddleware } from "@utils";
import { RouterService, ParamsService } from "@services";
import { Autowired } from "@decorators";
import { LennethSetting } from "./lenneth-setting";

/**
 *  服务抽象类，定义实现方法和钩子函数
 */
export abstract class LennethApplication implements ILennthApplication {
  @Autowired() private app: Koa;
  // 配置类实例
  @Autowired() private lennethSetting: LennethSetting;
  // 路由服务
  @Autowired() private routerService: RouterService;
  // 参数设置
  @Autowired() private paramsService: ParamsService;

  constructor() {
    // 获取设置的service参数
    const _settingParams = this.lennethSetting.getMetadata(this);
    if (_settingParams) {
      this._setSettings(_settingParams);
    }
  }

  /**
   * 设置参数
   * @param settings
   */
  private _setSettings(settings: LennethSetting) {
    this.lennethSetting.setMap(settings);
  }

  /**
   * 统一调用hook方法
   * @param key
   * @param elseFn
   * @param args
   */
  private _callHook(key: string, elseFn = new Function(), ...args: any[]) {
    const self = this;
    if (key in self) {
      return self[key](...args);
    }
    return elseFn();
  }

  /**
   * 加载拦截器
   */
  private async _loadInterceptor() {
    // 读取拦截器类
    let Interceptor = LennethSetting.serverSettingMap.get("interceptor");
    if (Interceptor) {
      let interceptorFun = new Interceptor().use;
      let asyncMiddle = toAsyncMiddleware(
        Interceptor,
        interceptorFun,
        interceptorFun[LENNETH_INTERCEPTOR_NAME],
        this.paramsService.paramsToList
      );
      this.app.use(asyncMiddle);
    }
  }

  /**
   * bodyParser
   */
  private async _loadBodyParser(): Promise<any> {
    return new Promise((res, err) => {
      this.app.use(bodyParser());
      res();
    });
  }

  /**
   * 设置controller路由
   */
  private async _loadRouters(): Promise<any> {
    let imports = LennethSetting.serverSettingMap.get("imports");
    return new Promise((res, err) => {
      // 设置controller 路径
      this.routerService.joinControllerPath(imports);
      // 载入路由
      this.routerService.loadRouter(this.app);
      res();
    });
  }

  /**
   * 错误处理中间件
   */
  private async _errorMiddleware(): Promise<any> {
    let errorMiddlewar = LennethSetting.serverSettingMap.get("error");
    if (errorMiddlewar) {
      let errorMiddlewarFun = new errorMiddlewar().use;
      let asyncMiddle = toErrorAsyncMiddleware(
        errorMiddlewar,
        errorMiddlewarFun,
        errorMiddlewarFun[LENNETH_ERROR_NAME],
        this.paramsService.paramsToErrorList
      );
      this.app.on("error", asyncMiddle);
    }
  }

  /**
   * 启动服务
   */
  private async _startServer(): Promise<any> {
    let { hostname, port } = this.lennethSetting.getHttpPort();
    return new Promise((res, err) => {
      this.app.listen(<number>port, hostname);
      res();
    });
  }

  /**
   *
   * @param middleware koa中间件
   */
  public use(middleware: Koa.Middleware): this {
    this.app.use(middleware);
    return this;
  }

  /**
   * start
   */
  public async start(): Promise<any> {
    const startTime = new Date();
    try {
      // 初始化(DB)
      await this._callHook("$onInit");
      // 拦截器
      await this._loadInterceptor();
      // 载入中间件
      await this._callHook("$onMountingMiddlewares", undefined, this.app);
      // 载入bodyParser
      await this._loadBodyParser();
      // 路由载入前
      await this._callHook("$onRoutesInit", undefined, this.app);
      // 载入路由
      await this._loadRouters();
      // 路由载入之后
      await this._callHook("$afterRoutesInit", undefined, this.app);
      // error处理中间件
      await this._errorMiddleware();
      // 启动服务
      await this._startServer();
      // 启动服务完成
      await this._callHook("$onReady");
    } catch (error) {
      this._callHook("$onServerInitError", undefined, error);
      return Promise.reject(error);
    }
  }
}
