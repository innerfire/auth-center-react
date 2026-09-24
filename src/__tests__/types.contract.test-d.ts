import type { AccountCenterProps } from "../types";

const defaults = {} satisfies AccountCenterProps;
const configured = {
  themeColor: "#0075de",
  avatarSize: 48,
} satisfies AccountCenterProps;

const noAdapter = {
  // @ts-expect-error API adapter must be an AccountCenterAdapter or undefined.
  adapter: {},
} satisfies AccountCenterProps;

const validAdapter = {
  adapter: {} as import("../types").AccountCenterAdapter,
} satisfies AccountCenterProps;

const noClassName = {
  // @ts-expect-error className is intentionally not part of the visual contract.
  className: "custom",
} satisfies AccountCenterProps;

const noStyle = {
  // @ts-expect-error style is intentionally not part of the visual contract.
  style: { color: "red" },
} satisfies AccountCenterProps;

const noItems = {
  // @ts-expect-error menu items are fixed.
  items: [],
} satisfies AccountCenterProps;

const noEndpoint = {
  // @ts-expect-error account API endpoints are fixed and same-origin.
  endpoint: "https://example.com",
} satisfies AccountCenterProps;

const invalidTheme = {
  // @ts-expect-error themeColor must be a string.
  themeColor: 123,
} satisfies AccountCenterProps;

const invalidSize = {
  // @ts-expect-error avatarSize must be a number.
  avatarSize: "48",
} satisfies AccountCenterProps;

void defaults;
void configured;
void noAdapter;
void validAdapter;
void noClassName;
void noStyle;
void noItems;
void noEndpoint;
void invalidTheme;
void invalidSize;
