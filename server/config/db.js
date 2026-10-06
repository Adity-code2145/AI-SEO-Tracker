import dns from 'dns'
dns.setServers(["8.8.8.8"]);
import mongoose from "mongoose";

const connectDB = async () => {
    mongoose.connection.on("connected", ()=> console.log("MongoDB connected"))
    await mongoose.connect(process.env.MONGODB_URI)
}
export default connectDB