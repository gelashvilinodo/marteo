import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Marteo",
    short_name: "Marteo",
    description: "ბიზნესის მართვის თანამედროვე პლატფორმა",
    lang: "ka",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0A244B",
    theme_color: "#0A244B",
    icons: [
      {
        src: "/icons/marteo-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/marteo-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}