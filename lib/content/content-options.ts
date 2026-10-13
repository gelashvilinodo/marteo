export const contentTypes = [
    { value: "POST", label: "პოსტი" },
    { value: "REEL", label: "რილსი" },
    { value: "STORY", label: "სთორი" },
    { value: "VIDEO", label: "ვიდეო" },
    { value: "ARTICLE", label: "სტატია" },
    { value: "OTHER", label: "სხვა" },
] as const;

export const contentPlatforms = [
    { value: "INSTAGRAM", label: "Instagram" },
    { value: "FACEBOOK", label: "Facebook" },
    { value: "TIKTOK", label: "TikTok" },
    { value: "YOUTUBE", label: "YouTube" },
    { value: "WEBSITE", label: "ვებსაიტი" },
    { value: "OTHER", label: "სხვა" },
] as const;