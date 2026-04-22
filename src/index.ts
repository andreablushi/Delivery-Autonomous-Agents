import { connect } from "./utils/api.js";
import { BDIAgent } from "./agents/bdi/bdi_agent.js";
import { exit } from "node:process";

/**
 * Entry point of the application. 
 */
async function main() {
    // Determine if the application is running in development mode for debugging purposes
    const debug = process.env.NODE_ENV === "development";
    
    // Connect to the server and create a single BDI agent with the connection
    const socket: any = await connect();
    new BDIAgent(socket, debug);

    // Check if the application is set to run in competitive debug mode
    if (process.env.COMPETITIVE === "true") {
        // Collect all tokens from the environment variables 
        const tokens: string[] = [];
        for (let i = 1; ; i++) {
            const t = process.env[`TOKEN_${i}`];
            if (!t) break;
            tokens.push(t);
        }
        // If no tokens are found, log an error message and exit the process
        if (tokens.length === 0) {
            console.error("No TOKEN_1 found. Add TOKEN_1, TOKEN_2, … to .env");
            exit(1);
        }

        // Launch the specified number of competitive agents by connecting to the server
        console.log(`Launching ${tokens.length} competitive agent(s)…`);
        const sockets = await Promise.all(tokens.map(connect));
        // Run without debug mode 
        sockets.forEach(socket => new BDIAgent(socket, false));
    }
}

// Run the main function and catch any errors for logging
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
