/**
 * SRK 相关类型定义
 * 参考：https://github.com/algoux/standard-ranklist
 */

/** ISO 8601 日期时间字符串 */
export type DatetimeISOString = string;

/** 时间单位 */
export type TimeUnit = 'ms' | 's' | 'min' | 'h' | 'd';

/** 时间持续时间 [数值, 单位] */
export type TimeDuration = [number, TimeUnit];

/**
 * 国际化字符串集合
 * @example { "en-US": 'English', "zh-CN": '中文', fallback: 'English' }
 */
export interface I18NStringSet {
  /** 当渲染器无法确定使用的语言时的回退字符串 */
  fallback: string;
  /** 键是 IETF BCP 47 语言标签，值是该语言标签对应的字符串 */
  [key: string]: string;
}

/** 文本类型（支持国际化） */
export type Text = string | I18NStringSet;

/** URL 链接 */
export type Link = string;

/** Base64 字符串 */
export type Base64 = string;

/** 图片（URL 或 Base64） */
export type Image = Link | Base64;

/** 带链接的图片 */
export interface ImageWithLink {
  image: Image;
  link: Link;
}

/** 带标题的链接 */
export interface LinkWithTitle {
  link: Link;
  title: Text;
}

/** 外部用户 */
export interface ExternalUser {
  id: string;
  name: Text;
}

/**
 * 比赛信息（SRK 标准）
 */
export interface Contest {
  /** 比赛标题 */
  title: Text;

  /** 开始时间 */
  startAt: DatetimeISOString;

  /** 比赛时长 */
  duration: TimeDuration;

  /** 榜单冻结时长 */
  frozenDuration?: TimeDuration;

  /** Banner 图片 */
  banner?: Image | ImageWithLink;

  /** 参考链接 */
  refLinks?: LinkWithTitle[];
}

/**
 * 用户信息（SRK 标准）
 */
export interface User {
  /** 用户唯一 ID */
  id: string;

  /** 用户名 */
  name: Text;

  /** 位置信息（如座位号） */
  location?: Text;

  /** 是否为正式选手（影响排名计算） */
  official?: boolean;

  /** 用户头像 */
  avatar?: Image;

  /** 所属组织 */
  organization?: Text;

  /** 队伍成员 */
  teamMembers?: ExternalUser[];

  /** 标记 ID（已废弃，使用 markers） */
  marker?: string;

  /** 标记 ID 列表 */
  markers?: string[];
}

