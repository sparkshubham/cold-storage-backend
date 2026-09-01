import mongoose from 'mongoose';
function isTransactionUnsupported(err) {
    const message = err instanceof Error ? err.message : String(err);
    return (message.includes('Transaction numbers are only allowed') ||
        message.includes('replica set') ||
        message.includes('IllegalOperation'));
}
export async function withTransaction(fn) {
    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await fn(session);
        });
        return result;
    }
    catch (err) {
        if (isTransactionUnsupported(err)) {
            return fn(undefined);
        }
        throw err;
    }
    finally {
        await session.endSession();
    }
}
//# sourceMappingURL=transaction.js.map