import { Group, User } from "../models/User.js";
import { transactions } from "../models/model.js";
import { arrayIntersection } from "./array.utils.js";
import {
  addEmail,
  findExistingUsers,
  findUsersGroup,
  getUserFromToken,
  getUserReferen,
  groupSchemaMapper,
} from "./group.utils.js";
import { userSchemaMapper } from "./users.utils.js";
import { verifyAuth } from "./utils.js";
import * as yup from "yup";
import { validateRequest } from "./validate.js";

/**
 * Return all the users
  - Request Body Content: None
  - Response `data` Content: An array of objects, each one having attributes `username`, `email` and `role`
  - Optional behavior:
    - empty array is returned if there are no users
 */
export const getUsers = async (req, res) => {
  try {
    // TODO: auth

    const users = await User.find();

    res.status(200).json({
      data: users.map((u) => userSchemaMapper(u)),
      refreshedTokenMessage: res.locals.refreshedTokenMessage,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Return information of a specific user
  - Request Body Content: None
  - Response `data` Content: An object having attributes `username`, `email` and `role`.
  - Optional behavior:
    - error 401 is returned if the user is not found in the system
 */
export const getUser = async (req, res) => {
  try {
    // TODO: auth

    const paramsSchema = yup.object({
      username: yup.string().required(),
    });

    // Validate params
    const { isValidationOk, params, errorMessage } = validateRequest(
      req,
      paramsSchema
    );
    if (!isValidationOk) {
      return res.status(400).json({ error: errorMessage });
    }
    const { username } = params;

    const user = await User.findOne({ username: username });

    // check if user exist
    if (!user) {
      return res.status(400).json({ error: "User doesn't exist" });
    }

    res.status(200).json({
      data: userSchemaMapper(user),
      refreshedTokenMessage: res.locals.refreshedTokenMessage,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Create a new group
  - Request Body Content: An object having a string attribute for the `name` of the group and an array that lists all the `memberEmails`
  - Response `data` Content: An object having an attribute `group` (this object must have a string attribute for the `name`
    of the created group and an array for the `members` of the group), an array that lists the `alreadyInGroup` members
    (members whose email is already present in a group) and an array that lists the `membersNotFound` (members whose email
    +does not appear in the system)
  - Optional behavior:
    - error 401 is returned if there is already an existing group with the same name
    - error 401 is returned if all the `memberEmails` either do not exist or are already in a group
 */
export const createGroup = async (req, res) => {
  try {
    const currUser = await getUserFromToken(req.cookies.refreshToken);
    // TODO: check for auth
    // ...

    // validate params
    const schema = yup.object({
      name: yup.string().required(),
      memberEmails: yup.array(yup.string().email().required()).required(),
    });

    const { body, errorMessage, isValidationOk } = validateRequest(
      req,
      null,
      schema,
      null
    );
    if (!isValidationOk) {
      return res.state(400).json({ error: errorMessage });
    }

    const { name, memberEmails } = body;

    // add currUser to memberEmails if not inside
    if (!memberEmails.includes(currUser.email)) {
      memberEmails.push(currUser.email);
    }

    // check for existing group
    const group = await Group.findOne({ name: name });
    if (group) {
      return res.status(400).json({ error: "Group already exists" });
    }

    // find existing users
    const [membersFound, membersNotFound] = await findExistingUsers(
      memberEmails
    );

    // find users in a group
    const [membersNotInGroup, membersInGroup] = await findUsersGroup(
      membersFound
    );

    // check if every user is non-existing or if is part of a group
    if (membersFound.length === membersInGroup.length) {
      return res
        .status(400)
        .json({ error: "User don't exit or already in a group" });
    }

    const members = await getUserReference(membersNotInGroup);
    const savedGroup = await Group.create([{ name: name, members: members }]);

    res.status(200).json({
      data: {
        group: groupSchemaMapper(savedGroup[0]),
        alreadyInGroup: membersInGroup,
        membersNotFound: membersNotFound,
      },
      refreshedTokenMessage: res.locals.refreshedTokenMessage,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Return all the groups
  - Request Body Content: None
  - Response `data` Content: An array of objects, each one having a string attribute for the `name` of the group
    and an array for the `members` of the group
  - Optional behavior:
    - empty array is returned if there are no groups
 */
export const getGroups = async (req, res) => {
  try {
    // TODO: check for admin auth
    // ...

    const groups = await Group.aggregate([
      {
        $project: {
          _id: 0,
          name: "$name",
          members: {
            $map: {
              input: "$members.email",
              as: "email",
              in: "$$email",
            },
          },
        },
      },
    ]);

    res.status(200).json({
      data: { groups: groups },
      refreshedTokenMessage: res.locals.refreshedTokenMessage,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Return information of a specific group
  - Request Body Content: None
  - Response `data` Content: An object having a string attribute for the `name` of the group and an array for the 
    `members` of the group
  - Optional behavior:
    - error 401 is returned if the group does not exist
 */
export const getGroup = async (req, res) => {
  try {
    // TODO: check for auth
    // ...

    const schema = yup.object({
      name: yup.string().required(),
    });

    // validate params
    const { params, errorMessage, isValidationOk } = validateRequest(
      req,
      schema
    );
    if (!isValidationOk) {
      return res.state(400).json({ error: errorMessage });
    }

    const { name } = params;

    // check if group exist
    const group = await Group.findOne({ name: name });

    if (!group) {
      return res.status(400).json({ error: "Group does not exists" });
    }

    res.status(200).json({
      data: groupSchemaMapper(group),
      refreshedTokenMessage: res.locals.refreshedTokenMessage,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Add new members to a group
  - Request Body Content: An array of strings containing the emails of the members to add to the group
  - Response `data` Content: An object having an attribute `group` (this object must have a string attribute for the `name` of the
    created group and an array for the `members` of the group, this array must include the new members as well as the old ones), 
    an array that lists the `alreadyInGroup` members (members whose email is already present in a group) and an array that lists 
    the `membersNotFound` (members whose email does not appear in the system)
  - Optional behavior:
    - error 401 is returned if the group does not exist
    - error 401 is returned if all the `memberEmails` either do not exist or are already in a group
 */
export const addToGroup = async (req, res) => {
  try {
    // TOOD: add auth

    const schemaBody = yup.object({
      emails: yup.array(yup.string().email().required()).required(),
    });

    const schemaParams = yup.object({
      name: yup.string().required(),
    });

    const { body, params, errorMessage, isValidationOk } = validateRequest(
      req,
      schemaBody,
      schemaParams
    );
    if (!isValidationOk) {
      return res.status(400).json({ error: errorMessage });
    }

    const { emails } = body;
    const { name } = params;

    if (emails.length === 0) {
      return res.status(400).json({ error: "List is empty" });
    }

    const group = await Group.findOne({ name: name });

    // check if group exists
    if (!group) {
      return res.status(400).json({ error: "Group does not exist" });
    }

    // find existing users
    const [membersFound, membersNotFound] = await findExistingUsers(emails);

    // find users in a group
    const [membersNotInGroup, membersInGroup] = await findUsersGroup(
      membersFound
    );

    // check if every user is non-existing or if is part of a group
    if (membersFound.length === membersInGroup.length) {
      return res
        .status(400)
        .json({ error: "Users don't exist or already in a group" });
    }

    const members = await getUserReference(membersNotInGroup);
    const updatedGroup = await Group.findOneAndUpdate(
      { name: name },
      { $push: { members: { $each: members } } },
      { new: true }
    );

    res.status(200).json({
      data: {
        group: groupSchemaMapper(updatedGroup),
        alreadyInGroup: membersInGroup,
        membersNotFound: membersNotFound,
      },
      refreshedTokenMessage: res.locals.refreshedTokenMessage,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Remove members from a group
  - Request Body Content: An object having an attribute `group` (this object must have a string attribute for the `name` of the
    created group and an array for the `members` of the group, this array must include only the remaining members),
    an array that lists the `notInGroup` members (members whose email is not in the group) and an array that lists 
    the `membersNotFound` (members whose email does not appear in the system)
  - Optional behavior:
    - error 401 is returned if the group does not exist
    - error 401 is returned if all the `memberEmails` either do not exist or are not in the group
 */
export const removeFromGroup = async (req, res) => {
  try {
    // TODO: auth

    const bodySchema = yup.object({
      emails: yup.array(yup.string().email().required()).required(),
    });

    const paramsSchema = yup.object({
      name: yup.string().required(),
    });

    const { isValidationOk, body, params, errorMessage } = validateRequest(
      req,
      paramsSchema,
      bodySchema
    );
    if (!isValidationOk) {
      return res.status(400).json({ error: errorMessage });
    }

    const { emails } = body;
    const { name } = params;

    if (emails.length === 0) {
      return res.status(400).json({ error: "List is empty" });
    }

    const group = await Group.findOne({ name: name });

    // check if group exists
    if (!group) {
      return res.status(400).json({ error: "Group does not exist" });
    }

    // find existing users
    const [membersFound, membersNotFound] = await findExistingUsers(emails);

    // find users in a group
    const [membersNotInGroup, membersInGroup] = await findUsersGroup(
      membersFound
    );

    // check if at least one user exist or is not part of a group
    if (membersFound.length === membersNotInGroup.length) {
      return res
        .status(400)
        .json({ error: "Users don't exist or not in a group" });
    }

    // find members to remove
    const membersToRemove = arrayIntersection(
      membersInGroup,
      group.members.map((m) => m.email)
    );

    // TODO: chiedere sul gruppo per ultimo membro di un gruppo
    const updatedGroup = await Group.findOneAndUpdate(
      { name: name },
      { $pull: { members: { email: { $in: membersToRemove } } } },
      { new: true }
    );

    // If all users were removed from a group also remove the group
    if (updatedGroup.members.length === 0) {
      await Group.findOneAndDelete({ name: name });
    }

    res.status(200).json({
      data: {
        group: groupSchemaMapper(updatedGroup),
        notInGroup: membersNotInGroup,
        membersNotFound: membersNotFound,
      },
      refreshedTokenMessage: res.locals.refreshedTokenMessage,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Delete a user
  - Request Parameters: None
  - Request Body Content: A string equal to the `email` of the user to be deleted
  - Response `data` Content: An object having an attribute that lists the number of `deletedTransactions` and a boolean attribute that
    specifies whether the user was also `deletedFromGroup` or not.
  - Optional behavior:
    - error 401 is returned if the user does not exist 
 */
export const deleteUser = async (req, res) => {
  try {
    // TODO: auth

    const bodySchema = yup.object({
      email: yup.string().email().required(),
    });

    // Validate params
    const { isValidationOk, body, errorMessage } = validateRequest(
      req,
      null,
      bodySchema
    );
    if (!isValidationOk) {
      return res.status(400).json({ error: errorMessage });
    }
    const { email } = body;

    const user = await User.findOneAndDelete({ email: email });

    // check if user exist
    if (!user) {
      return res.status(400).json({ error: "User doesn't exist" });
    }

    let deletedFromGroup = false;
    // Find if user is in a group
    const toRemoveFromGroup = await Group.aggregate([
      {
        $match: {
          members: { $elemMatch: { email: email } },
        },
      },
    ]);

    // remove user from gruop
    if (toRemoveFromGroup.length !== 0) {
      const updatedGroup = await Group.findOneAndUpdate(
        { name: toRemoveFromGroup[0].name },
        { $pull: { members: { email: email } } },
        { new: true }
      );

      if (updatedGroup.members.length === 0) {
        await Group.findOneAndDelete({ name: updatedGroup.name });
      }

      deletedFromGroup = true;
    }

    // delete users transactions
    const removedTransactions = await transactions.deleteMany({
      username: user.username,
    });

    res.status(200).json({
      data: {
        deletedTransactions: removedTransactions.deletedCount,
        deletedFromGroup: deletedFromGroup,
      },
      message: res.locals.message,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Delete a group
  - Request Body Content: A string equal to the `name` of the group to be deleted
  - Response `data` Content: A message confirming successful deletion
  - Optional behavior:
    - error 401 is returned if the group does not exist
 */
export const deleteGroup = async (req, res) => {
  try {
    // TODO: auth

    const bodySchema = yup.object({
      name: yup.string().required(),
    });

    const { isValidationOk, body, errorMessage } = validateRequest(
      req,
      null,
      bodySchema
    );
    if (!isValidationOk) {
      return res.status(400).json({ error: errorMessage });
    }
    const { name } = body;

    const group = await Group.findOneAndDelete({ name: name });

    // check if group exists
    if (!group) {
      return res.status(400).json({ error: "Group does not exists" });
    }

    res.status(200).json({
      data: { message: "Group delete successfully" },
      refreshedTokenMessage: res.locals.refreshedTokenMessage,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};
