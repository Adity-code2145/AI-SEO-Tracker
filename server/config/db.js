import dns from "node:dns";
import mongoose from "mongoose";
import KeywordTracking from "../models/keywordTracking.js";

dns.setServers(["8.8.8.8"]);

const connectDB = async () => {
    if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI is not configured");
    }

    mongoose.connection.on("connected", () => console.log("MongoDB connected"));
    await mongoose.connect(process.env.MONGODB_URI);

    const collectionExists = await mongoose.connection.db
        .listCollections({ name: KeywordTracking.collection.name }, { nameOnly: true })
        .hasNext();
    if (collectionExists) {
        const indexes = await KeywordTracking.collection.indexes();
        const obsoleteIndex = indexes.find((index) => index.key?.useId === 1);
        if (obsoleteIndex) {
            await KeywordTracking.collection.dropIndex(obsoleteIndex.name);
        }
    }
    await KeywordTracking.init();
};
export default connectDB;