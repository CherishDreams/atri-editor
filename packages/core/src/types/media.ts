/**
 * 媒体（图片 / 附件）配置
 */

/** 上传进度 */
export interface UploadProgress {
  /** 0-100 */
  percent: number;
  loaded: number;
  total: number;
}

/** 上传结果；name / size / mime 缺省时沿用本地文件的值 */
export interface UploadResult {
  url: string;
  name?: string;
  size?: number;
  mime?: string;
}

/** 自定义上传时的上下文 */
export interface UploadContext {
  onProgress: (progress: UploadProgress) => void;
  /** 编辑器销毁或用户取消时中止 */
  signal: AbortSignal;
}

/**
 * 完全接管上传：库不发请求，只负责把结果写回文档
 * 给了它就忽略 endpoint 分支
 */
export type UploadHandler = (file: File, context: UploadContext) => Promise<UploadResult>;

/**
 * 内置上传通道（XHR，fetch 拿不到可移植的上传进度）
 */
export interface AtriUploadConfig {
  /** 接收 multipart/form-data 的接口地址 */
  endpoint: string;
  /** 文件字段名，默认 `file` */
  fieldName?: string;
  /** 附加请求头，如授权令牌 */
  headers?: Record<string, string>;
  /** 是否携带 Cookie */
  withCredentials?: boolean;
  /** 服务端要求的文件名与本地不同时使用 */
  requestName?: (file: File) => string;
  /** 响应体形状千差万别，用它挑出 url；缺省时依次找 url / data.url / location */
  transformResult?: (body: unknown, file: File) => UploadResult;
}

/**
 * 媒体类型，与同名节点一一对应
 */
export type MediaKind = 'image' | 'attachment';

/** 插入被拒绝的原因 */
export type MediaRejectReason =
  /** 超出 maxFileSize */
  | 'too-large'
  /** 不在 accept 白名单内 */
  | 'unsupported-type'
  /** 一次投放的文件数超过 maxFiles，多出来的那些每个回调一次 */
  | 'too-many'
  /** 本地文件需要上传，但没配上传通道也不允许 base64 */
  | 'no-upload'
  /** 请求发出后失败 */
  | 'upload-failed';

/** 插入被拒绝时回调 */
export interface MediaRejection {
  file: File;
  reason: MediaRejectReason;
  /** upload-failed 时的原始错误 */
  cause?: unknown;
}

/**
 * 图片节点配置
 */
export interface AtriImageConfig {
  /** 是否作为内联节点插入，默认 false（块级） */
  inline?: boolean;
  /**
   * 是否允许 data URL 形式的 base64 图片，默认 false
   * 同时也是没有上传通道时的退路开关：关掉它，本地文件将无从插入
   */
  allowBase64?: boolean;
  /** 是否显示缩放手柄，默认 true */
  resize?: boolean;
  /** 类型白名单，如 `image/*` 或 `.png,.jpg` */
  accept?: string | string[];
}

/**
 * 附件节点配置
 */
export interface AtriAttachmentConfig {
  /** 类型白名单，默认不限 */
  accept?: string | string[];
}

/**
 * 插入图片的参数
 */
export interface InsertImageOptions {
  src: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
}

/**
 * 插入附件卡片的参数
 */
export interface InsertAttachmentOptions {
  /** 文件地址 */
  src: string;
  /** 展示名，缺省时从 src 推导 */
  name?: string | null;
  /** 字节数 */
  size?: number | null;
  mime?: string | null;
}

/**
 * 媒体配置；传 false 完全不注册图片与附件扩展
 */
export interface AtriMediaConfig {
  /** 上传通道：配置对象走内置 XHR，或直接给一个函数完全接管 */
  upload?: AtriUploadConfig | UploadHandler;
  /** 单个文件上限（字节），默认 10MB */
  maxFileSize?: number;
  /** 一次投放/选择的文件数上限，默认 10 */
  maxFiles?: number;
  /** 校验不通过或上传失败时回调，编辑器不弹任何默认提示 */
  onError?: (rejection: MediaRejection) => void;
  /** 图片配置 */
  image?: AtriImageConfig;
  /** 附件配置 */
  attachment?: AtriAttachmentConfig;
}
