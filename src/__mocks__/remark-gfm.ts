/**
 * Jest mock for remark-gfm.
 *
 * remark-gfm is ESM-only and next/jest's default transformIgnorePatterns
 * blocks it from being transformed by Jest. Since unit tests don't need
 * actual GFM parsing, this no-op plugin satisfies the import.
 */
function remarkGfm() {
    return function transform() {
        // no-op in tests
    }
}

export default remarkGfm
module.exports = remarkGfm
module.exports.default = remarkGfm
