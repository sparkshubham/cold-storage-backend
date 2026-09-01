export async function nextCode(model, companyId, prefix, field = 'code', width = 6) {
    const count = await model.countDocuments({ companyId });
    return `${prefix}-${String(count + 1).padStart(width, '0')}`;
}
//# sourceMappingURL=codes.js.map