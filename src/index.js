import { connect } from "./utils/api.js";

/**
 * Entry point of the application. 
*/
async function main() {
    // Connect to the server and get the socket instance
    const socket = await connect();

}

// Run the main function and catch any errors for logging
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
