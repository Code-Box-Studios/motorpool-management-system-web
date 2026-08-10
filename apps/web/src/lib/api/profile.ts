// src/lib/api/profile.ts
import type { OwnProfileResponse, UpdateOwnProfileBody } from '@mms/shared';
import { api, toAssetUrl } from './client.js';

// The API's own-profile row needs no reshaping — it already speaks the FE's
// language (it even resolves branchName for us, since a non-admin has no branch
// list to look an id up in). The one fix-up is the avatar: stored relative
// (/uploads/avatars/x.jpg) but served by the API, not the web dev server, so it
// goes out absolute for <img src>.
function toOwnProfile(p: OwnProfileResponse): OwnProfileResponse {
  return { ...p, avatarUrl: toAssetUrl(p.avatarUrl) };
}

// GET /users/me — any authenticated role; the id comes from the token, so this
// can only ever read the caller's own row.
export const getOwnProfile = async (): Promise<OwnProfileResponse> => {
  return toOwnProfile(await api.get<OwnProfileResponse>('/users/me'));
};

// PATCH /users/me — self-service edit. Multipart to match the API route
// (avatarUpload.single('avatar') + validateBody), so the optional photo travels
// with the text fields in one request.
//
// A field is only sent when the caller supplies it; an empty string IS sent —
// it is how a person clears a phone number or an address. There is no role,
// status or branch to strip: UpdateOwnProfileBody does not carry them, so a
// user cannot change what they are allowed to do.
export const updateOwnProfile = async (
  updates: UpdateOwnProfileBody,
  avatarFile?: File
): Promise<OwnProfileResponse> => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) formData.append(key, value);
  }
  if (avatarFile) formData.append('avatar', avatarFile);

  return toOwnProfile(
    await api.patchForm<OwnProfileResponse>('/users/me', formData)
  );
};
