import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import jwt from 'jsonwebtoken';
import { verifyAuth } from './utils.js';

export const isValidEmail = (email) => {
    // Regular expression pattern for validating email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Test the email against the regex pattern
    return emailRegex.test(email);
}

export const isValidBody = (body) => {
    if (typeof body.username !== 'string' || typeof body.email !== 'string' || typeof body.password !== 'string') {
        return false;
    }
    const username = body.username ? body.username.trim() : undefined;
    const email = body.email ? body.email.trim() : undefined;
    const password = body.password ? body.password.trim() : undefined;
    if (username && email && password) {
        return true;
    }
    else {
        return false;
    }
}
/**
 * Register a new user in the system
  - Request Body Content: An object having attributes `username`, `email` and `password`
  - Response `data` Content: A message confirming successful insertion
  - Optional behavior:
    - error 400 is returned if there is already a user with the same username and/or email
 */
export const register = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!isValidBody(req.body)) {
            return res.status(400).json({ error: "Non valid req.body" });
        }
        if (!isValidEmail(email)) {
            res.status(400).json({ error: "email is not in the correct format" });
            return;
        }
        const existingUser = await User.findOne({ $or: [{ email: email }, { username: username }] });
        if (existingUser) return res.status(400).json({ error: "you are already registered" });
        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = await User.create({
            username,
            email,
            password: hashedPassword,
        });
        res.status(200).json({ data: { message: 'user added succesfully' } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * Register a new user in the system with an Admin role
  - Request Body Content: An object having attributes `username`, `email` and `password`
  - Response `data` Content: A message confirming successful insertion
  - Optional behavior:
    - error 400 is returned if there is already a user with the same username and/or email
 */
export const registerAdmin = async (req, res) => {
    try {
        if (!isValidBody(req.body)) {
            return res.status(400).json({ error: "Non valid req.body" });
        }
        const { username, email, password } = req.body
        if (!isValidEmail(email)) {
            res.status(400).json({ error: "email is not in the correct format" });
            return;
        }
        const existingUser = await User.findOne({ $or: [{ email: email }, { username: username }] });
        if (existingUser) return res.status(400).json({ error: "you are already registered" });
        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = await User.create({
            username,
            email,
            password: hashedPassword,
            role: "Admin"
        });
        res.status(200).json({ data: { message: 'admin added succesfully' } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }

}

/**
 * Perform login 
  - Request Body Content: An object having attributes `email` and `password`
  - Response `data` Content: An object with the created accessToken and refreshToken
  - Optional behavior:
    - error 400 is returned if the user does not exist
    - error 400 is returned if the supplied password does not match with the one in the database
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const body = req.body;
        //Dummy property to use isValidBody also for login
        body.username = 'dummy';
        if (!isValidBody(body)) {
            return res.status(400).json({ error: "Non valid req.body" });
        }
        if (!isValidEmail(email)) {
            res.status(400).json({ error: "email is not in the correct format" });
            return;
        }
        const existingUser = await User.findOne({ email: email })
        if (!existingUser) return res.status(400).json({ error: 'please you need to register' })
        const match = await bcrypt.compare(password, existingUser.password)
        if (!match) return res.status(400).json({ error: 'wrong credentials' })
        //CREATE ACCESSTOKEN
        const accessToken = jwt.sign({
            email: existingUser.email,
            id: existingUser.id,
            username: existingUser.username,
            role: existingUser.role
        }, process.env.ACCESS_KEY, { expiresIn: '1h' })
        //CREATE REFRESH TOKEN
        const refreshToken = jwt.sign({
            email: existingUser.email,
            id: existingUser.id,
            username: existingUser.username,
            role: existingUser.role
        }, process.env.ACCESS_KEY, { expiresIn: '7d' })
        //SAVE REFRESH TOKEN TO DB
        existingUser.refreshToken = refreshToken
        const savedUser = await existingUser.save()
        res.cookie("accessToken", accessToken, { httpOnly: true, domain: "localhost", path: "/api", maxAge: 60 * 60 * 1000, sameSite: "none", secure: true })
        res.cookie('refreshToken', refreshToken, { httpOnly: true, domain: "localhost", path: '/api', maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'none', secure: true })
        res.status(200).json({ data: { accessToken: accessToken, refreshToken: refreshToken } })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

/**
 * Perform logout
  - Auth type: Simple
  - Request Body Content: None
  - Response `data` Content: A message confirming successful logout
  - Optional behavior:
    - error 400 is returned if the user does not exist
 */
export const logout = async (req, res) => {
    const refreshToken = req.cookies.refreshToken
    if (!refreshToken) return res.status(400).json({ error: "user not found" })
    try {
        const user = await User.findOne({ refreshToken: refreshToken })
        if (!user) return res.status(400).json({ error: 'user not found' })
        user.refreshToken = null
        res.cookie("accessToken", "", { httpOnly: true, path: '/api', maxAge: 0, sameSite: 'none', secure: true })
        res.cookie('refreshToken', "", { httpOnly: true, path: '/api', maxAge: 0, sameSite: 'none', secure: true })
        const savedUser = await user.save()
        res.status(200).json({ data: { message: 'logged out' } })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}
