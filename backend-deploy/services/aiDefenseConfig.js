module.exports = {
  getConfig: () => ({
    autoSubmitThreshold: 85,
    reviewThreshold: 70,
    autoSubmitEnabled: false
  }),
  updateConfig: async (config) => config
};
