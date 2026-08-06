export const computePlanSavings = ({ price, services }) => {
  const planPrice = Number(price) || 0

  const fullValue = (services ?? []).reduce((sum, service) => {
    const unitPrice = Number(service.price)
    const quota = Number(service.monthly_quota)
    if (!isFinite(unitPrice) || isNaN(unitPrice)) return sum
    const safeQuota = isFinite(quota) && !isNaN(quota) ? quota : 0
    return sum + safeQuota * unitPrice
  }, 0)

  const savings = Math.max(0, fullValue - planPrice)
  const savingsPct = fullValue > 0 ? Math.round((savings / fullValue) * 100) : 0

  return { fullValue, planPrice, savings, savingsPct }
}
