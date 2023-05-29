import { categories, transactions } from "../models/model.js";
import { Group, User } from "../models/User.js";
import { handleDateFilterParams, handleAmountFilterParams, verifyAuth } from "./utils.js";

/**
 * Create a new category
  - Request Body Content: An object having attributes `type` and `color`
  - Response `data` Content: An object having attributes `type` and `color`
 */
export const createCategory = (req, res) => {
    try {
        const cookie = req.cookies
        if (!cookie.accessToken) {
            return res.status(401).json({ message: "Unauthorized" }) // unauthorized
        }
        const { type, color } = req.body;
        const new_categories = new categories({ type, color });
        new_categories.save()
            .then(data => res.json(data))
            .catch(err => { throw err })
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

/**
 * Edit a category's type or color
  - Request Body Content: An object having attributes `type` and `color` equal to the new values to assign to the category
  - Response `data` Content: An object with parameter `message` that confirms successful editing and a parameter `count` that is equal to the count of transactions whose category was changed with the new type
  - Optional behavior:
    - error 401 returned if the specified category does not exist
    - error 401 is returned if new parameters have invalid values
 */
export const updateCategory = async (req, res) => {
    try {

    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

/**
 * Delete a category
  - Request Body Content: An array of strings that lists the `types` of the categories to be deleted
  - Response `data` Content: An object with parameter `message` that confirms successful deletion and a parameter `count` that is equal to the count of affected transactions (deleting a category sets all transactions with that category to have `investment` as their new category)
  - Optional behavior:
    - error 401 is returned if the specified category does not exist
 */
export const deleteCategory = async (req, res) => {
    try {

    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

/**
 * Return all the categories
  - Request Body Content: None
  - Response `data` Content: An array of objects, each one having attributes `type` and `color`
  - Optional behavior:
    - empty array is returned if there are no categories
 */
export const getCategories = async (req, res) => {
    try {
        const cookie = req.cookies
        if (!cookie.accessToken) {
            return res.status(401).json({ message: "Unauthorized" }) // unauthorized
        }
        let data = await categories.find({})

        let filter = data.map(v => Object.assign({}, { type: v.type, color: v.color }))

        return res.json(filter)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

/**
 * Create a new transaction made by a specific user
  - Request Body Content: An object having attributes `username`, `type` and `amount`
  - Response `data` Content: An object having attributes `username`, `type`, `amount` and `date`
  - Optional behavior:
    - error 401 is returned if the username or the type of category does not exist
 */
export const createTransaction = async (req, res) => {
    try {
        const { username, amount, type } = req.body;
        if(!username || !amount || !type || username==="" || amount==="" || type===""){
            return res.status(400).json({ error: "Missing body attributes"});
        }
        const auth=verifyAuth(req, res,{authType: "User", username:username});
        if(!auth.flag){
            return res.status(401).json({error: auth.cause})
        }
        if(username!==req.params.username){
            return res.status(400).json({ error: "Username mismatch"});
        }
        const user=await User.findOne({username:username});
        if(!user){
            return res.status(400).json({ error: "User not found"});
        }
        const category= await categories.findOne({type: type});
        if(!category){
            return res.status(400).json({ error: "Category not found"});
        }
        const checkedAmount=Number(amount);
        if(isNaN(checkedAmount))
            return res.status(400).json({ error: "Invalid 'amount' value"});
        const savedTransaction= await transactions.create({username, amount:checkedAmount, type});
        res.status(200).json({data: savedTransaction, refreshedTokenMessage: res.locals.refreshedTokenMessage})
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

/**
 * Return all transactions made by all users
  - Request Body Content: None
  - Response `data` Content: An array of objects, each one having attributes `username`, `type`, `amount`, `date` and `color`
  - Optional behavior:
    - empty array must be returned if there are no transactions
 */
export const getAllTransactions = async (req, res) => {
    try {
        const auth=verifyAuth(req,res,{authType:"Admin"});
        if (!auth.flag) {
            return res.status(401).json({ error: auth.cause }) // unauthorized
        }
        /**
         * MongoDB equivalent to the query "SELECT * FROM transactions, categories WHERE transactions.type = categories.type"
         */
        transactions.aggregate([
            {
                $lookup: {
                    from: "categories",
                    localField: "type",
                    foreignField: "type",
                    as: "categories_info"
                }
            },
            { $unwind: "$categories_info" }
        ]).then((result) => {
            let data = result.map(v => Object.assign({}, { _id: v._id, username: v.username, amount: v.amount, type: v.type, color: v.categories_info.color, date: v.date }))
            res.json({data: data, refreshedTokenMessage: res.locals.refreshedTokenMessage});
        }).catch(error => {
            throw (error) 
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

/**
 * Return all transactions made by a specific user
  - Request Body Content: None
  - Response `data` Content: An array of objects, each one having attributes `username`, `type`, `amount`, `date` and `color`
  - Optional behavior:
    - error 401 is returned if the user does not exist
    - empty array is returned if there are no transactions made by the user
    - if there are query parameters and the function has been called by a Regular user then the returned transactions must be filtered according to the query parameters
 */
export const getTransactionsByUser = async (req, res) => {
    try {
        const username = req.params.username;
        let matchObj = {username: username};
        let auth;
        //Distinction between route accessed by Admins or Regular users for functions that can be called by both
        //and different behaviors and access rights
        if (req.url.indexOf("/transactions/users/") >= 0) {
            //ADMIN
            auth=verifyAuth(req,res,{authType:"Admin"});   
        } else {
            //SIMPLE USER
            auth=verifyAuth(req,res,{authType:"User", username:username});
            const dateFilter=handleDateFilterParams(req);
            const amountFilter=handleAmountFilterParams(req);
            Object.assign(matchObj, dateFilter, amountFilter);
        }
        if(!auth.flag){
            return res.status(401).json({error:auth.cause})
        }
        const user = await User.findOne({username: username });
        if (!user)
            return res.status(400).json({ error: "User not found"});
              
        transactions.aggregate([
            {
                $match: matchObj
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "type",
                    foreignField: "type",
                    as: "categories_info"
                }
            },
            { $unwind: "$categories_info" }
        ]).then((result) => {
            let data = result.map(v => Object.assign({}, { _id: v._id, username: v.username, amount: v.amount, type: v.type, color: v.categories_info.color, date: v.date }))
            res.json({data:data, refreshedTokenMessage: res.locals.refreshedTokenMessage});
        }).catch(error => { throw (error) })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

/**
 * Return all transactions made by a specific user filtered by a specific category
  - Request Body Content: None
  - Response `data` Content: An array of objects, each one having attributes `username`, `type`, `amount`, `date` and `color`, filtered so that `type` is the same for all objects
  - Optional behavior:
    - empty array is returned if there are no transactions made by the user with the specified category
    - error 401 is returned if the user or the category does not exist
 */
export const getTransactionsByUserByCategory = async (req, res) => {
    try {
        const {username, category}=req.params;
        
        const user = await User.findOne({ username: username });
        if (!user)
            return res.status(400).json({ error: "User not found"});
        const dbCategory = await categories.findOne({type: category});
        if (!dbCategory) 
            return res.status(400).json({ error: "Category not found"});
        let auth;
        if (req.url.indexOf("/transactions/users/") >= 0) {//Admin
            auth=verifyAuth(req, res, {authType:"Admin"});
        }
        else{ //Regular user
            auth=verifyAuth(req, res, {authType:"User", username: username});
        }
        if(!auth.flag){
            return res.status(401).json({error:auth.cause});
        }
        transactions.aggregate([
            {
                $match: {
                    username:username,
                    type:category
                    }
            },
                {
                    $lookup: {
                        from: "categories",
                        localField: "type",
                        foreignField: "type",
                        as: "categories_info"
                    }
                },
                { $unwind: "$categories_info" }
            ]).then((result) => {
                let data = result.map(v => Object.assign({}, { _id: v._id, username: v.username, amount: v.amount, type: v.type, color: v.categories_info.color, date: v.date }))
                return res.json({data:data, refreshedTokenMessage: res.locals.refreshedTokenMessage});
            }).catch(error => { throw (error) })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

/**
 * Return all transactions made by members of a specific group
  - Request Body Content: None
  - Response `data` Content: An array of objects, each one having attributes `username`, `type`, `amount`, `date` and `color`
  - Optional behavior:
    - error 401 is returned if the group does not exist
    - empty array must be returned if there are no transactions made by the group
 */
export const getTransactionsByGroup = async (req, res) => {
    try {
        const group= await Group.findOne({name:req.params.name});
        if(!group){
            return res.status(400).json({ error: "Group not found"});
        }
        let auth;
        if (req.url.indexOf("/transactions/groups/") >= 0) {//Admin
            auth=verifyAuth(req, res, {authType:"Admin"})
        }
        else{ //Regular user
            const emails=group.members.map((m)=>m.email);
            auth=verifyAuth(req, res, {authType:"Group", emails:emails});
        }
        if(!auth.flag){
            return res.status(401).json({error: auth.cause});
        }
        transactions.aggregate([
            {
                $match: {
                    username:{$in: groupMembers}
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "type",
                    foreignField: "type",
                    as: "categories_info"
                }
            },
            { $unwind: "$categories_info" }
        ]).then((result) => {
            let data = result.map(v => Object.assign({}, { _id: v._id, username: v.username, amount: v.amount, type: v.type, color: v.categories_info.color, date: v.date }))
            res.json({data:data, refreshedTokenMessage: res.locals.refreshedTokenMessage});
        }).catch(error => { throw (error) })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

/**
 * Return all transactions made by members of a specific group filtered by a specific category
  - Request Body Content: None
  - Response `data` Content: An array of objects, each one having attributes `username`, `type`, `amount`, `date` and `color`, filtered so that `type` is the same for all objects.
  - Optional behavior:
    - error 401 is returned if the group or the category does not exist
    - empty array must be returned if there are no transactions made by the group with the specified category
 */
export const getTransactionsByGroupByCategory = async (req, res) => {
    try {
        const group= await Group.findOne({name:req.params.name});
        if(!group){
            return res.status(400).json({ error: "Group not found"});
        }
        const dbCategory= await categories.findOne({type:req.params.category});
        if(!dbCategory){
            return res.status(400).json({ error: "Category not found"});
        }
        let auth;
        if (req.url.indexOf("/transactions/groups/") >= 0) {//Admin
            auth=verifyAuth(req, res, {authType:"Admin"})
        }
        else{ //Regular user
            const emails=group.members.map((m)=>m.email);
            auth=verifyAuth(req, res, {authType:"Group", emails:emails});    
        }
        if(!auth.flag){
            return res.status(401).json({error: auth.cause});
        }
        transactions.aggregate([
            {
                $match: {
                    username:{$in: groupMembers},
                    type:req.params.category
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "type",
                    foreignField: "type",
                    as: "categories_info"
                }
            },
            { $unwind: "$categories_info" }
        ]).then((result) => {
            let data = result.map(v => Object.assign({}, { _id: v._id, username: v.username, amount: v.amount, type: v.type, color: v.categories_info.color, date: v.date }))
            res.json({data: data, message: res.locals.message});
        }).catch(error => { throw (error) })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

/**
 * Delete a transaction made by a specific user
  - Request Body Content: The `_id` of the transaction to be deleted
  - Response `data` Content: A string indicating successful deletion of the transaction
  - Optional behavior:
    - error 401 is returned if the user or the transaction does not exist
 */
export const deleteTransaction = async (req, res) => { //only called by regular users
    try {
        const username=req.params.username;
        const auth=verifyAuth(req, res, {authType:"User", username:username})
        if(!auth.flag){
            return res.status(401).json({error: auth.cause})
        }
        const user=await User.findOne({username:username})
        if(!user){
            return res.status(400).json({ error: "User not found"});
        }
        const id=req.body._id;
        if (!id)
            return res.status(400).json({ error: "Missing body attibutes"});
        const transactionToDelete=await transactions.findById(id);
        if(!transactionToDelete){
            return res.status(400).json({ error: "Transaction not found"});
        }
        if(transactionToDelete.username!==user.username){
            res.status(401).json({error:"Unauthorized"});
        }

        let data = await transactions.deleteOne({ _id: req.body._id });
        return res.json({data: {message: "Transaction deleted"}, refreshedTokenMessage: res.locals.refreshedTokenMessage});
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

/**
 * Delete multiple transactions identified by their ids
  - Request Body Content: An array of strings that lists the `_ids` of the transactions to be deleted
  - Response `data` Content: A message confirming successful deletion
  - Optional behavior:
    - error 401 is returned if at least one of the `_ids` does not have a corresponding transaction. Transactions that have an id are not deleted in this case
 */
export const deleteTransactions = async (req, res) => {
    try {
        const ids=req.body._ids;
        if(!ids){
            return res.status(400).json({ error: "Missing body attributes"});
        }
        const auth=verifyAuth(req, res, {authType:"Admin"})
        if(auth.flag){
            return res.status(401).json({error:auth.cause})
        }
        await ids.forEach(async (id) => {
            if(id===""){
                return res.status(400).json({ error: "Invalid id"});
            }
            const t=await transactions.findById(id);
            if(!t){
                return res.status(400).json({ error: "Transaction not found"});
            }
        } )

        await transactions.deleteMany({_id: {$in: ids}});
        return res.status(200).json({data: {message: "Transactions deleted"}, 
                                    refreshedTokenMessage: res.locals.refreshedTokenMessage});
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}
/** Retrieves the usernames of the members of a group
 * 
 * @param {String} groupName the name of the group
 * @returns {string[]} an array of the usernames 
 */
const findGroupUsernames= async(groupName)=>{
    const members=await Group.aggregate([
        {
            $match: {name:groupName}
        },
        {
            $unwind:"$members"
        },
        {
            $project:{'_id':0,
                'user_id': '$members.user'}
        },
        {
            $lookup: {
              from: 'users',
              localField: "user_id",
              foreignField: "_id",
              as:"user_info"
            }
        },
        {
            $unwind:"$user_info"
        },
        {
            $project: {
              'username': '$user_info.username'
            }
        }
    ])
    return members.map(m=>m.username)
}