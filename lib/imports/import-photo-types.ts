export type ImportEmbeddedPhoto = {
    // სტაბილური მისამართი წყაროს ფაილის შიგნით.
    sourcePath: string;

    // ფურცელი და რიგი, რომელთანაც ფოტო დაკავშირებულია.
    sheetName: string;
    rowNumber: number;

    // სვეტი მხოლოდ მდებარეობის დასადგენად გამოიყენება.
    columnNumber: number;

    originalName: string;
    mimeType: string;
    blob: Blob;
};

export type ImportPhotoReadIssue = {
    code:
        | "UNSUPPORTED_IMAGE"
        | "UNRESOLVED_IMAGE_POSITION"
        | "MULTIPLE_IMAGES"
        | "BROKEN_IMAGE";

    message: string;
    sheetName: string | null;
    rowNumber: number | null;
};

export type ImportPhotoReadResult = {
    photos: ImportEmbeddedPhoto[];
    issues: ImportPhotoReadIssue[];
};