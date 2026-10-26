export type ReportSection = { title: string; columns: string[]; rows: string[][]; note?: string };
export type AccountantReport = {
    businessName: string; from: string; to: string; createdAt: string;
    highlights: Array<{ label: string; value: string; description: string }>;
    warnings: string[]; sections: ReportSection[];
};
