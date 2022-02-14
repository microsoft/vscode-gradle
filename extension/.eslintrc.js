// eslint-disable-next-line no-undef
module.exports = {
    root: true,
    parser: "@typescript-eslint/parser",
    plugins: ["@typescript-eslint", "prettier"],
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:prettier/recommended"],
    rules: {
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/consistent-type-assertions": [
            2,
            {
                assertionStyle: "as",
                objectLiteralTypeAssertions: "allow",
            },
        ],
        "no-case-declarations": "off",
        "no-async-promise-executor": "off",
    },
    ignorePatterns: "scripts/*.js",
};
