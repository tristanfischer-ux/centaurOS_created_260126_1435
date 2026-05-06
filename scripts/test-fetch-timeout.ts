import { fetchWithTimeout } from "../src/lib/fetch-with-timeout";

async function main() {
    console.log("Testing fetchWithTimeout...");
    try {
        const response = await fetchWithTimeout(
            "https://httpstat.us/200?sleep=5000",
            {},
            2000
        );
        console.log("Response OK:", response.ok);
    } catch (e) {
        console.error("Caught error:", e.message);
    }
}
main();
