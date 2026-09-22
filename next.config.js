export default {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // These are mounted or created at runtime, never bundled with the server.
  outputFileTracingExcludes: {
    "/*": ["./artifacts/**/*", "./.local-reviews/**/*", "./.pr-chats/**/*", "./.pr-tours/**/*", "./.devcontainer/**/*", "./.git/**/*"],
  },
};
