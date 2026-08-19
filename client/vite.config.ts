import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  envPrefix: ["VITE_", "PUBLIC_"],
  plugins: [tailwindcss(), sveltekit()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: [
            "src/lib/{api,signaling,webrtc,types}/**/*.{test,spec}.{js,ts}",
          ],
        },
      },
      {
        extends: true,
        resolve: {
          conditions: ["browser"],
        },
        test: {
          name: "components",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: [
            "src/lib/components/**/*.{test,spec}.{js,ts}",
            "src/**/*.svelte.{test,spec}.{js,ts}",
          ],
        },
      },
    ],
  },
});
