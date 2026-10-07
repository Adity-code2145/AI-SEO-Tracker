import User from "../models/User.js";
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"

// Generate JWT token
const generateToken = (id)=>{
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured");
    }
    return jwt.sign({id}, process.env.JWT_SECRET, {expiresIn: "30d"})
}

//Register user
export const register = async (req,res)=>{
    try {
        const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
        const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";
        
        if (!name || !email || !password) {
            return res.status(400).json({success: false,message: "All fields are required"});
        }

        //Check if user exists
        const existingUser = await User.findOne({email})

        if(existingUser) return res.status(400).json({success: false,message:
            "User already exists"});

        //Hash password
        const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10))


        //Create user
        const user = await User.create({name, email, password : hashedPassword})

        const token = generateToken(user._id);

        const publicUser = user.toObject();
        delete publicUser.password;
        res.status(201).json({success: true, token, user: publicUser})

    } catch (error) {
        console.error("Register error:", error)
        if (error.code === 11000) {
            return res.status(400).json({success: false, message: "User already exists"});
        }
        res.status(500).json({success: false, message: "Server error"})
    }
}

// Login user

export const login = async (req,res) =>{
    try {
        const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";

        if(!email || !password) return res.status(400).json({success: false, message : "All fields are required"});

        //Find user
        const user = await User.findOne({email})
        if(!user) return res.status(400).json({success: false, message : "Invalid credentials"});

        // agar user mil gaya then
        // Check password
        const isMatch = await bcrypt.compare(password, user.password)
        if(!isMatch){
            return res.status(400).json({success: false, message: "Invalid credentials"})
        }

        // now if password is also matching
        const token = generateToken(user._id);
        
        const publicUser = user.toObject();
        delete publicUser.password;
        res.status(200).json({success: true, token, user: publicUser})

    } catch (error) {
        console.error("Login error:", error)
        res.status(500).json({success: false, message: "Server error"})
    }
}

// Get current user
export const getUser = async (req,res) =>{
    try {
        const user = await User.findById(req.userId).select("-password");
        if(!user){
            return res.status(400).json({success: false, message: "User not found"})
        }

        res.json({success: true, user})

    } catch (error) {
        console.error("Get user error:", error.message)
        res.status(500).json({success: false, message: "Server error"})
    }
}