//#region src/utils/index.d.ts
/** Avatar placeholder URL (inline SVG data URI) */
declare const AVATAR_PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 80 80\"><rect width=\"80\" height=\"80\" rx=\"40\" fill=\"%23e5e5e5\"/><text x=\"50%\" y=\"54%\" text-anchor=\"middle\" font-size=\"32\" fill=\"%23999\" font-family=\"sans-serif\">\uD83D\uDC64</text></svg>";
/** Returns true when width < 768 */
declare function isMobileViewport(): boolean;
/** Validate nickname: 2-20 user-visible grapheme clusters after trim. */
declare function validateNickname(raw: string): string | null;
/** Validate password change form fields */
declare function validatePasswordChange(oldPw: string, newPw: string, confirmPw: string): string | null;
/**
 * Validate an image File for avatar upload:
 *  - type JPEG/PNG
 *  - original file ≤ 2 MiB
 */
declare function validateAvatarFile(file: File): string | null;
/**
 * Convert a Blob to a data-URL string (used for preview).
 */
declare function blobToDataUrl(blob: Blob): Promise<string>;
/**
 * Crop a square from a canvas. Returns a Blob.
 */
declare function cropSquare(sourceCanvas: HTMLCanvasElement, size?: number): Promise<Blob>;
//#endregion
export { validateAvatarFile as a, isMobileViewport as i, blobToDataUrl as n, validateNickname as o, cropSquare as r, validatePasswordChange as s, AVATAR_PLACEHOLDER as t };
//# sourceMappingURL=index-XmvEC-rC.d.ts.map