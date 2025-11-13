
export async function GenerateUid() {
    // 动态导入 uuid（ESM 模块）
    const { v4: uuidv4 } = await import('uuid');
    return uuidv4();
}