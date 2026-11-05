import next from "eslint-config-next/core-web-vitals";
const config = [
  ...next,
  {
    ignores: [
      "**/.next/**",
      "**/out/**",
      "hosting-source/**",
      "**/public/vendor/**",
      "**/public/sw.js",
    ],
  },
  {
    rules: {
      "@next/next/no-img-element": "off",
      "@next/next/no-html-link-for-pages": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
