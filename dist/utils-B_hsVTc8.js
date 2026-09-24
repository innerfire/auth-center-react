//#region src/utils/index.ts
/** Avatar placeholder URL (inline SVG data URI) */
const AVATAR_PLACEHOLDER = "data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 80 80\"><rect width=\"80\" height=\"80\" rx=\"40\" fill=\"%23e5e5e5\"/><text x=\"50%\" y=\"54%\" text-anchor=\"middle\" font-size=\"32\" fill=\"%23999\" font-family=\"sans-serif\">👤</text></svg>";
/** Returns true when width < 768 */
function isMobileViewport() {
	if (typeof window === "undefined") return false;
	return window.innerWidth < 768;
}
/** Validate nickname: 2-20 user-visible grapheme clusters after trim. */
function validateNickname(raw) {
	const trimmed = raw.normalize("NFC").trim();
	const count = typeof Intl.Segmenter === "function" ? [...new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(trimmed)].length : [...trimmed].length;
	if (count < 2) return "昵称至少 2 个字符";
	if (count > 20) return "昵称最多 20 个字符";
	return null;
}
/** Validate password change form fields */
function validatePasswordChange(oldPw, newPw, confirmPw) {
	if (!oldPw) return "请输入原密码";
	if (newPw.length < 8) return "新密码至少 8 位";
	if (new TextEncoder().encode(oldPw).byteLength > 128 || new TextEncoder().encode(newPw).byteLength > 128) return "密码不能超过 128 UTF-8 bytes";
	if (!/[a-zA-Z]/.test(newPw) || !/[0-9]/.test(newPw)) return "新密码须包含字母和数字";
	if (newPw === oldPw) return "新密码不能与原密码相同";
	if (newPw !== confirmPw) return "两次输入的新密码不一致";
	return null;
}
/**
* Validate an image File for avatar upload:
*  - type JPEG/PNG
*  - original file ≤ 2 MiB
*/
function validateAvatarFile(file) {
	if (!["image/jpeg", "image/png"].includes(file.type)) return "仅支持 JPG / PNG 格式";
	if (file.size > 2 * 1024 * 1024) return "文件大小不能超过 2 MiB";
	return null;
}
/**
* Convert a Blob to a data-URL string (used for preview).
*/
function blobToDataUrl(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}
/**
* Crop a square from a canvas. Returns a Blob.
*/
function cropSquare(sourceCanvas, size = 512) {
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	canvas.getContext("2d").drawImage(sourceCanvas, 0, 0, size, size);
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) resolve(blob);
			else reject(/* @__PURE__ */ new Error("Canvas export failed"));
		}, "image/jpeg", .92);
	});
}

//#endregion
export { validateAvatarFile as a, isMobileViewport as i, blobToDataUrl as n, validateNickname as o, cropSquare as r, validatePasswordChange as s, AVATAR_PLACEHOLDER as t };
//# sourceMappingURL=utils-B_hsVTc8.js.map