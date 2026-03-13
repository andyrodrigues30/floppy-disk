export function isTextFile(path: string): boolean {
    return /\.(txt|md|csv|json|js|ts)$/i.test(path)
}