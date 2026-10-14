import "server-only";
import { cache } from "react";
import { getPgDashboardContext } from "./pg-dashboard-context";

export const getCurrentBusiness = cache(async () => (await getPgDashboardContext())?.membership ?? null);
