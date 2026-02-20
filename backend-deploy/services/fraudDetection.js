module.exports = {
  analyzeFraud: async (data) => ({ score: 0, indicators: [], recommendation: 'REVIEW_RECOMMENDED' }),
  getFraudIndicators: async () => []
};
