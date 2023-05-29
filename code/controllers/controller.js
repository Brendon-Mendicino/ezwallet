import { Model, model } from "mongoose";
import { categories, transactions } from "../models/model.js";
import { Group, User } from "../models/User.js";
import { handleDateFilterParams, handleAmountFilterParams, verifyAuth } from "./utils.js";

/**
 * Create a new category
  - Request Body Content: An object having attributes `type` and `color`
  - Response `data` Content: An object having attributes `type` and `color`
 */
export const createCategory = async (req, res) => {
    try {
        //Perform control on authentication
        const adminAuth = verifyAuth(req, res, { authType: "Admin" });
        if (!adminAuth.flag) {
            return res.status(401).json({ error: adminAuth.cause });
        }

        const { type, color } = req.body;

        // Check attributes' validity
        if(typeof type !== 'string' || typeof color !== 'string' || !type.trim() || !color.trim()){
            return res.status(400).json({ error: 'Invalid attribute' });
        }

        //Check if the category already exists
        const category = await categories.findOne({ type: type });
        if (category) {
            return res.status(400).json({ error: "Category with same type already exists" });
        }

        const new_categories = new categories({ type, color });
        const data = await new_categories.save();
        return res.status(200).json({ data: { type: data.type, color: data.color }, refreshedTokenMessage: res.locals.refreshedTokenMessage });
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

/**
 * Edit a category's type or color
  - Request Body Content: An object having attributes `type` and `color` equal to the new values to assign to the category
  - Response `data` Content: An object with parameter `message` that confirms successful editing and a parameter `count` that is equal to the count of transactions whose category was changed with the new type
  - Optional behavior:
    - error 400 returned if the specified category does not exist
    - error 400 is returned if new parameters have invalid values
 */
export const updateCategory = async (req, res) => {
    try {
        //Perform control on authentication
        const adminAuth = verifyAuth(req, res, { authType: "Admin" });
        if (!adminAuth.flag) {
            return res.status(401).json({ error: adminAuth.cause });
        }

        //Retrieve from URL params the category to update
        const oldType = req.params.type;

        //Check the validity of req.params.type
        if (!oldType) {
            return res.status(400).json({ error: "Invalid parameter in request" });
        }

        //Retrieve from request Body the new fields for the category
        const { type, color } = req.body;

        // Check attributes' validity
        if(typeof type !== 'string' || typeof color !== 'string' || !type.trim() || !color.trim()){
            return res.status(400).json({ error: 'Invalid attribute' });
        }

        //Detect if the old category actually exists
        const oldCategory = await categories.findOne({ type: oldType });
        if (!oldCategory) {
            return res.status(400).json({ error: "The category does not exist" });
        }

        // Detect if the new type already exist
        const newExist = await categories.findOne({type : type});
        // If the type passed as parameter and the one passed in the body are equal
        // we can update the color
        if(newExist && type !== oldType){
            return res.status(400).json({error: 'Category type already exists'});
        }

        //Update the target category
        await categories.updateOne({ type: oldType }, { $set: { type: type, color: color } });  // Update the category

        //Update all the related transactions and retrieve the number of changed transactions
        const changes = await transactions.updateMany({ type: oldType }, { $set: { type: type } });

        return res.status(200).json({data: {message: "Category edited successfully", count: changes.modifiedCount}, refreshedTokenMessage: res.locals.refreshedTokenMessage});
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

/**
 * Delete a category
  - Request Body Content: An array of strings that lists the `types` of the categories to be deleted
  - Response `data` Content: An object with parameter `message` that confirms successful deletion and a parameter `count` that is equal to the count of affected transactions (deleting a category sets all transactions with that category to have the first category as their new category)
  - Optional behavior:
    - error 400 is returned if the specified category does not exist
    
    - Implementation: 
    -   The existence of all categories is checker, if at least one the passed category does not exist nothing is deleted; 
    -   All non existent categories are specified in the error message.
 */
export const deleteCategory = async (req, res) => {
    try {
        //Perform control on authentication
        const adminAuth = verifyAuth(req, res, { authType: "Admin" });
        if (!adminAuth.flag) {
            return res.status(401).json({ error: adminAuth.cause });
        }
        //Retrieve array of types from request body
        const { types } = req.body

        //Check validity of req.body
        if (!Array.isArray(types) || types.length === 0) {
            return res.status(400).json({ error: 'Types must be a non-void array' });
        }
        for (const type of types) {
            if (typeof type !== 'string' || !type.trim()) {
                return res.status(400).json({ error: 'Types must be an array of non-void strings' });
            }
        }

        //Get the total number of categories in the database
        const nCategories = await categories.countDocuments();
        if(nCategories <= 1)
            return res.status(400).json({error: 'Not enough categories to perform a deletion'});

        //Check for the existence of all categories, return categories sorted in ascending order of creationTime
        const foundCategories = await categories.find({ type: { $in: types }}, {sort :{CreatedAt:1}});
        
        //Return an error if at least one category does not exist
        if (foundCategories.length < types.length) {
            return res.status(400).json({ error: "All categories must exist" });
        }

        let typesToDelete, oldestType;
        //Check if categories to be deleted cover all the categories in the DB
        if (foundCategories.length === nCategories) {
            //Retrieve all types to delete except for the first element (the first according to creationTime)
            typesToDelete = foundCategories.map(e => e.type).slice(1);
            oldestType = foundCategories[0].type;

            //Delete all categories except the first one
            await categories.deleteMany({ type: { $in: typesToDelete } });
        } else {
            //Delete all categories present in req.body.types 
            typesToDelete = types;
            await categories.deleteMany({ type: { $in: typesToDelete } });

            //Retrieve the first created category among the remaining ones
            const oldestCategory = await categories.findOne({}, {}, {sort :{ createdAt: 1 }});
            oldestType = oldestCategory.type;
        }
        //Update all transactions involved with the type of the category with first creation time
        const result = await transactions.updateMany({ type: { $in: typesToDelete } }, { $set: { type: oldestType } });
        return res.status(200).json({data: {message: "Categories deleted", count: result.modifiedCount}, refreshedTokenMessage: res.locals.refreshedTokenMessage});
    } catch (error) {
        res.status(500).json({ error: error.message })
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
        //Perform control on authentication
        const simpleAuth = verifyAuth(req, res, { authType: "Simple" });
        if (!simpleAuth.flag) {
            return res.status(401).json({ error: simpleAuth.cause });
        }
        
        let data = await categories.find({})
        let filter = data.map(v => Object.assign({}, { type: v.type, color: v.color }))

        return res.status(200).json({data: filter, refreshedTokenMessage: res.locals.refreshedTokenMessage});
    } catch (error) {
        res.status(500).json({ error: error.message })
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
        const cookie = req.cookies
        if (!cookie.accessToken) {
            return res.status(401).json({ message: "Unauthorized" }) // unauthorized
        }
        const { username, amount, type } = req.body;
        const new_transactions = new transactions({ username, amount, type });
        new_transactions.save()
            .then(data => res.json(data))
            .catch(err => { throw err })
    } catch (error) {
        res.status(400).json({ error: error.message })
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
        const cookie = req.cookies
        if (!cookie.accessToken) {
            return res.status(401).json({ message: "Unauthorized" }) // unauthorized
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
            res.json(data);
        }).catch(error => { throw (error) })
    } catch (error) {
        res.status(400).json({ error: error.message })
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
        //Distinction between route accessed by Admins or Regular users for functions that can be called by both
        //and different behaviors and access rights
        if (req.url.indexOf("/transactions/users/") >= 0) {
        } else {
        }
    } catch (error) {
        res.status(400).json({ error: error.message })
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
    } catch (error) {
        res.status(400).json({ error: error.message })
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
    } catch (error) {
        res.status(400).json({ error: error.message })
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
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}

/**
 * Delete a transaction made by a specific user
  - Request Body Content: The `_id` of the transaction to be deleted
  - Response `data` Content: A string indicating successful deletion of the transaction
  - Optional behavior:
    - error 401 is returned if the user or the transaction does not exist
 */
export const deleteTransaction = async (req, res) => {
    try {
        const cookie = req.cookies
        if (!cookie.accessToken) {
            return res.status(401).json({ message: "Unauthorized" }) // unauthorized
        }
        let data = await transactions.deleteOne({ _id: req.body._id });
        return res.json("deleted");
    } catch (error) {
        res.status(400).json({ error: error.message })
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
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
}
