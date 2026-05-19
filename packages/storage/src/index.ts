// @ilaunchify/storage — Cloudflare R2 client wrapper.
//
// R2 is S3-compatible; we use the AWS SDK pointed at R2's endpoint.
//
// Required env (set in .env.local at repo root):
//   R2_ACCOUNT_ID         — Cloudflare account id (find in dashboard URL)
//   R2_ACCESS_KEY_ID      — generated under R2 > Manage R2 API Tokens
//   R2_SECRET_ACCESS_KEY  — same place
//   R2_BUCKET_NAME        — bucket to write to (e.g. "ilaunchify-uploads")
//
// All env access goes through getR2Config() which throws a useful error
// when something is missing — callers should let that propagate rather
// than crashing with a generic "undefined" stack trace.

export {
  uploadFile,
  deleteFile,
  type UploadInput,
  type UploadResult,
} from './upload'
export { getSignedReadUrl } from './signed-url'
export { partnerFileKey } from './keys'
