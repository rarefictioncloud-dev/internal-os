const CLOUD_NAME =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;

const UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const PROFILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

const LIBRARY_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "jpg",
  "jpeg",
  "png",
  "webp",
];

const MAX_PROFILE_SIZE = 5 * 1024 * 1024;
const MAX_MEDIA_SIZE = 100 * 1024 * 1024;
const MAX_LIBRARY_SIZE = 25 * 1024 * 1024;

async function upload(
  file,
  folder,
  allowedTypes,
  maxSize
) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary is not configured. Check your .env file."
    );
  }

  if (!file) {
    throw new Error("No file selected.");
  }

  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      "This file type is not supported."
    );
  }

  if (file.size > maxSize) {
    throw new Error(
      `File is too large. Maximum size is ${
        maxSize / 1024 / 1024
      } MB.`
    );
  }

  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        "Cloudinary upload failed."
    );
  }

  return data;
}

/*
 * =====================================================
 * PROFILE PHOTO
 * =====================================================
 */

export async function uploadProfileImage(
  file,
  uid
) {
  return upload(
    file,
    `rare-fiction/profiles/${uid}`,
    PROFILE_TYPES,
    MAX_PROFILE_SIZE
  );
}

export const uploadProfilePhoto =
  uploadProfileImage;

/*
 * =====================================================
 * DELIVERABLE MEDIA
 * =====================================================
 */

export async function uploadDeliverableFile(
  file,
  deliverableId
) {
  return upload(
    file,
    `rare-fiction/deliverables/${deliverableId}`,
    MEDIA_TYPES,
    MAX_MEDIA_SIZE
  );
}

/*
 * =====================================================
 * LIBRARY DOCUMENTATION
 * =====================================================
 */

export async function uploadLibraryFile(
  file,
  category
) {
  if (!file) {
    throw new Error("No file selected.");
  }

  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase() || "";

  if (!LIBRARY_EXTENSIONS.includes(extension)) {
    throw new Error(
      "Unsupported library file type."
    );
  }

  if (file.size > MAX_LIBRARY_SIZE) {
    throw new Error(
      "Library files must be 25 MB or smaller."
    );
  }

  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary is not configured. Check your .env file."
    );
  }

  const folder =
    category === "CLIENT"
      ? "rare-fiction/library/client-documentation"
      : "rare-fiction/library/rare-fiction-documentation";

  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        "Cloudinary library upload failed."
    );
  }

  if (!data?.secure_url) {
    throw new Error(
      "Cloudinary did not return a secure URL."
    );
  }

  return data;
}