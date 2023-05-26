import request from "supertest";
import { app } from "../app";
import { Group, GroupSchema, User } from "../models/User.js";
import {
  addToGroup,
  createGroup,
  deleteGroup,
  getGroup,
  getGroups,
  removeFromGroup,
} from "../controllers/users";
import groupStub from "./stubs/group.stub";
import { Document } from "mongoose";
import { groupSchemaMapper } from "../controllers/group.utils";

/**
 * In order to correctly mock the calls to external modules it is necessary to mock them using the following line.
 * Without this operation, it is not possible to replace the actual implementation of the external functions with the one
 * needed for the test cases.
 * `jest.mock()` must be called for every external module that is called in the functions under test.
 */
jest.mock("../models/User.js");
jest.mock("../controllers/group.utils.js", () => {
  const originalModule = jest.requireActual("../controllers/group.utils.js");
  return {
    __esModule: true,
    ...originalModule,
    getUserFromToken: jest.fn(),
  };
});

import { getUserFromToken } from "../controllers/group.utils";

/**
 * Defines code to be executed before each test case is launched
 * In this case the mock implementation of `User.find()` is cleared, allowing the definition of a new mock implementation.
 * Not doing this `mockClear()` means that test cases may use a mock implementation intended for other test cases.
 */
beforeEach(() => {
  jest.clearAllMocks();
  //additional `mockClear()` must be placed here
});

describe("getUsers", () => {
  test("should return empty list if there are no users", async () => {
    //any time the `User.find()` method is called jest will replace its actual implementation with the one defined below
    jest.spyOn(User, "find").mockImplementation(() => []);
    const response = await request(app).get("/api/users");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test("should retrieve list of all users", async () => {
    const retrievedUsers = [
      {
        username: "test1",
        email: "test1@example.com",
        password: "hashedPassword1",
      },
      {
        username: "test2",
        email: "test2@example.com",
        password: "hashedPassword2",
      },
    ];
    jest.spyOn(User, "find").mockImplementation(() => retrievedUsers);
    const response = await request(app).get("/api/users");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(retrievedUsers);
  });
});

describe("getUser", () => {});

describe("Group", () => {
  const mockRes = () => {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      locals: {
        refreshedTokenMessage: "rToken",
      },
    };
  };

  // TODO: substitu aggregate calls with the ones in `group.utils.js`

  /**
   * Get all groups
   */
  const GroupFind = jest.spyOn(Group, "find");
  /**
   * Find the group
   */
  const GroupFindOne = jest.spyOn(Group, "findOne");
  /**
   * Find users that belongs to a group
   */
  const GroupAggregate = jest.spyOn(Group, "aggregate");
  /**
   * Insert a group
   */
  const GroupCreate = jest.spyOn(Group, "create");
  /**
   * Update a group
   */
  const GroupFindOneAndUpdate = jest.spyOn(Group, "findOneAndUpdate");
  /**
   * Delete a group
   */
  const GroupFindOneAndDelete = jest.spyOn(Group, "findOneAndDelete");
  /**
   * Find the existing users or get the user reference
   */
  const UserAggregate = jest.spyOn(User, "aggregate");

  describe("createGroup", () => {
    const reqStub = () => {
      return {
        body: {
          name: groupStub().name,
          memberEmails: groupStub().members.map((m) => m.email),
        },
        cookies: {
          refreshToken: "rToken",
        },
      };
    };

    const userCallingStub = () => ({
      name: "bre",
      email: "bre@bre.it",
      refreshToken: "rToken",
    });

    beforeEach(async () => {
      jest.resetAllMocks();
    });

    test("result status should be 200", async () => {
      getUserFromToken.mockResolvedValue(userCallingStub());
      GroupFindOne.mockResolvedValueOnce();
      UserAggregate.mockResolvedValueOnce(
        groupStub().members.map((m) => ({ email: m.email }))
      );
      GroupAggregate.mockResolvedValueOnce([]);
      UserAggregate.mockResolvedValueOnce(groupStub().members);
      GroupCreate.mockResolvedValueOnce([groupStub()]);

      const res = mockRes();
      await createGroup(reqStub(), res);

      expect(GroupFindOne).toHaveBeenCalledWith({ name: groupStub().name });
      expect(GroupCreate).toHaveBeenCalledWith([groupStub()]);
      expect(res.json).toBeCalledWith({
        data: {
          group: groupSchemaMapper(groupStub()),
          alreadyInGroup: [],
          membersNotFound: [],
        },
        refreshedTokenMessage: mockRes().locals.refreshedTokenMessage,
      });
      expect(res.status).toBeCalledWith(200);
    });

    test("result status should be 400 when group already exists", async () => {
      getUserFromToken.mockResolvedValue(userCallingStub());
      GroupFindOne.mockResolvedValue(groupStub());
      const res = mockRes();
      await createGroup(reqStub(), res);

      expect(GroupFindOne).toHaveBeenCalled();
      expect(res.status).toBeCalledWith(400);
      expect(res.json).toBeCalled();
    });

    test("result status should be 400 when all users don't exists", async () => {
      getUserFromToken.mockResolvedValue(userCallingStub());
      GroupFindOne.mockResolvedValue();
      UserAggregate.mockResolvedValue([]);
      GroupAggregate.mockResolvedValue([]);

      const res = mockRes();
      await createGroup(reqStub(), res);

      expect(GroupFindOne).toHaveBeenCalled();
      expect(UserAggregate).toHaveBeenCalled();
      expect(GroupAggregate).toHaveBeenCalled();

      expect(res.status).toBeCalledWith(400);
    });

    test("result status should be 400 when all user belong to a group or don't exist", async () => {
      getUserFromToken.mockResolvedValue(userCallingStub());
      GroupFindOne.mockResolvedValue();
      UserAggregate.mockResolvedValueOnce([
        groupStub().members.map((u) => ({ email: u.email }))[0],
      ]);
      GroupAggregate.mockResolvedValue([
        groupStub().members.map((u) => ({ _id: u.email }))[0],
      ]);

      const res = mockRes();
      await createGroup(reqStub(), res);

      expect(GroupFindOne).toHaveBeenCalled();
      expect(UserAggregate).toHaveBeenCalled();
      expect(GroupAggregate).toHaveBeenCalled();

      expect(res.status).toBeCalledWith(400);
    });

    test("result should get non-exising users and already in a group", async () => {
      let userNotExist = "lar@lar.it";
      let userInGroup = "mat@mat.it";

      getUserFromToken.mockResolvedValue({
        name: "mat",
        email: userInGroup,
        refreshToken: "rToken",
      });
      GroupFindOne.mockResolvedValueOnce();
      const existingUsers = groupStub().members.map((m) => {
        return { email: m.email };
      });
      existingUsers.push({ email: userInGroup });
      UserAggregate.mockResolvedValueOnce(existingUsers);
      GroupAggregate.mockResolvedValueOnce([{ _id: userInGroup }]);
      UserAggregate.mockResolvedValueOnce(groupStub().members);
      GroupCreate.mockResolvedValueOnce([groupStub()]);

      let req = reqStub();
      req.body.memberEmails.push(userNotExist, userInGroup);
      const res = mockRes();
      await createGroup(req, res);

      expect(res.status).toBeCalledWith(200);
      expect(res.json).toBeCalledWith({
        data: {
          group: groupSchemaMapper(groupStub()),
          alreadyInGroup: [userInGroup],
          membersNotFound: [userNotExist],
        },
        refreshedTokenMessage: mockRes().locals.refreshedTokenMessage,
      });
    });
  });

  describe("getGroups", () => {
    beforeEach(async () => {
      jest.clearAllMocks();
    });

    test("should return a list of all groups", async () => {
      GroupFind.mockResolvedValue([groupStub()]);

      const res = mockRes();
      await getGroups({}, res);

      expect(GroupFind).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: { groups: [groupSchemaMapper(groupStub())] },
        refreshedTokenMessage: mockRes().locals.refreshedTokenMessage,
      });
    });

    test("should return an empty list", async () => {
      GroupFind.mockResolvedValue([]);

      const res = mockRes();
      await getGroups({}, res);

      expect(GroupFind).toBeCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: { groups: [] },
        refreshedTokenMessage: mockRes().locals.refreshedTokenMessage,
      });
    });
  });

  describe("getGroup", () => {
    const reqStub = () => ({
      params: { name: groupStub().name },
    });

    beforeEach(async () => {
      jest.clearAllMocks();
    });

    test("should return a group", async () => {
      GroupFindOne.mockResolvedValue(groupStub());

      const res = mockRes();
      await getGroup(reqStub(), res);

      expect(GroupFindOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: groupSchemaMapper(groupStub()),
        refreshedTokenMessage: mockRes().locals.refreshedTokenMessage,
      });
    });

    test("should return 400 when the group does not exist", async () => {
      GroupFindOne.mockResolvedValue();

      const res = mockRes();
      await getGroup(reqStub(), res);

      expect(GroupFindOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("addToGroup", () => {
    beforeEach(async () => {
      jest.clearAllMocks();
    });

    const emailsToAdd = ["lar@lar.it", "mat@mat.it"];
    const group = groupStub();
    let id = 3;
    const members = emailsToAdd.map((e) => ({ email: e, user: id++ }));
    const updatedGroup = (() => {
      const g = groupStub();
      g.members.push(...members);
      return g;
    })();

    const reqStub = () => ({
      body: { emails: emailsToAdd },
      params: { name: group.name },
    });

    test("should return the updated group", async () => {
      const res = mockRes();

      GroupFindOne.mockResolvedValueOnce(groupStub());
      UserAggregate.mockResolvedValueOnce(
        emailsToAdd.map((e) => ({ email: e }))
      );
      GroupAggregate.mockResolvedValueOnce([]);
      UserAggregate.mockResolvedValueOnce(members);
      GroupFindOneAndUpdate.mockResolvedValueOnce(updatedGroup);

      await addToGroup(reqStub(), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: {
          group: groupSchemaMapper(updatedGroup),
          alreadyInGroup: [],
          membersNotFound: [],
        },
        refreshedTokenMessage: mockRes().locals.refreshedTokenMessage,
      });
    });

    test("sould return 400 if group does not exist", async () => {
      GroupFindOne.mockResolvedValue();

      const res = mockRes();
      await addToGroup(reqStub(), res);

      expect(GroupFindOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("result status should be 400 when all users don't exists", async () => {
      GroupFindOne.mockResolvedValueOnce(groupStub());
      UserAggregate.mockResolvedValueOnce([]);
      GroupAggregate.mockResolvedValueOnce([]);

      const res = mockRes();
      await addToGroup(reqStub(), res);

      expect(GroupFindOne).toHaveBeenCalled();
      expect(UserAggregate).toHaveBeenCalled();
      expect(GroupAggregate).toHaveBeenCalled();

      expect(res.status).toBeCalledWith(400);
    });

    test("result status should be 400 when all user belong to a group or don't exist", async () => {
      GroupFindOne.mockResolvedValueOnce(groupStub());
      UserAggregate.mockResolvedValueOnce([{ email: emailsToAdd[0] }]);
      GroupAggregate.mockResolvedValue([{ _id: emailsToAdd[0] }]);

      const res = mockRes();
      await addToGroup(reqStub(), res);

      expect(GroupFindOne).toHaveBeenCalled();
      expect(UserAggregate).toHaveBeenCalled();
      expect(GroupAggregate).toHaveBeenCalled();

      expect(res.status).toBeCalledWith(400);
    });

    test("result should get non-exising users and already in a group", async () => {
      let userNotExist = "lar@lar.it";
      let userInGroup = "mat@mat.it";

      GroupFindOne.mockResolvedValueOnce(groupStub());
      const existingUsers = (() => {
        const g = groupStub().members.map((m) => {
          return { email: m.email };
        });
        g.push({ email: userInGroup });
        return g;
      })();
      UserAggregate.mockResolvedValueOnce(existingUsers);
      GroupAggregate.mockResolvedValueOnce([{ _id: userInGroup }]);
      UserAggregate.mockResolvedValueOnce(groupStub().members);
      GroupFindOneAndUpdate.mockResolvedValueOnce(groupStub());

      const req = reqStub();
      req.body.emails.push(...groupStub().members.map((m) => m.email));
      const res = mockRes();
      await addToGroup(req, res);

      expect(res.status).toBeCalledWith(200);
      expect(res.json).toBeCalledWith({
        data: {
          group: groupSchemaMapper(groupStub()),
          alreadyInGroup: [userInGroup],
          membersNotFound: [userNotExist],
        },
        refreshedTokenMessage: mockRes().locals.refreshedTokenMessage,
      });
    });
  });

  describe("removeFromGroup", () => {
    beforeEach(async () => {
      jest.clearAllMocks();
    });

    const emailsToRemove = groupStub().members.map((m) => m.email);
    const group = groupStub();
    let id = 3;
    const emailsToRemoveReference = emailsToRemove.map((e) => ({
      email: e,
      user: id++,
    }));
    const updatedGroup = (() => {
      const g = groupStub();
      g.members = [];
      return g;
    })();

    const reqStub = () => ({
      body: {
        emails: emailsToRemove,
      },
      params: { name: group.name },
    });

    test("should return the updated group", async () => {
      const res = mockRes();

      GroupFindOne.mockResolvedValueOnce(groupStub());
      UserAggregate.mockResolvedValueOnce(
        emailsToRemove.map((e) => ({ email: e }))
      );
      GroupAggregate.mockResolvedValueOnce(
        emailsToRemove.map((e) => ({ _id: e }))
      );
      UserAggregate.mockResolvedValueOnce(emailsToRemoveReference);
      GroupFindOneAndUpdate.mockResolvedValueOnce(updatedGroup);

      await removeFromGroup(reqStub(), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: {
          group: groupSchemaMapper(updatedGroup),
          notInGroup: [],
          membersNotFound: [],
        },
        refreshedTokenMessage: mockRes().locals.refreshedTokenMessage,
      });
    });

    test("sould return 400 if group does not exist", async () => {
      GroupFindOne.mockResolvedValue();

      const res = mockRes();
      await removeFromGroup(reqStub(), res);

      expect(GroupFindOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test("result status should be 400 when all users don't exists", async () => {
      GroupFindOne.mockResolvedValueOnce(groupStub());
      UserAggregate.mockResolvedValueOnce([]);
      GroupAggregate.mockResolvedValueOnce([]);

      const res = mockRes();
      await removeFromGroup(reqStub(), res);

      expect(GroupFindOne).toHaveBeenCalled();
      expect(UserAggregate).toHaveBeenCalled();
      expect(GroupAggregate).toHaveBeenCalled();

      expect(res.status).toBeCalledWith(400);
    });

    test("result status should be 400 when all users don't belong to a group or don't exist", async () => {
      GroupFindOne.mockResolvedValueOnce(groupStub());
      UserAggregate.mockResolvedValueOnce([{ email: emailsToRemove[0] }]);
      GroupAggregate.mockResolvedValue([{ _id: emailsToRemove[1] }]);

      const res = mockRes();
      await removeFromGroup(reqStub(), res);

      expect(GroupFindOne).toHaveBeenCalled();
      expect(UserAggregate).toHaveBeenCalled();
      expect(GroupAggregate).toHaveBeenCalled();

      expect(res.status).toBeCalledWith(400);
    });

    test("result should get non-exising users and not in a group", async () => {
      const userNotExist = "lar@lar.it";
      const userNotInGroup = "mat@mat.it";
      const existingUsers = (() => {
        const g = groupStub().members.map((m) => {
          return { email: m.email };
        });
        g.push({ email: userNotInGroup });
        return g;
      })();

      GroupFindOne.mockResolvedValueOnce(groupStub());
      UserAggregate.mockResolvedValueOnce(existingUsers);
      GroupAggregate.mockResolvedValueOnce(
        emailsToRemove.map((e) => ({ _id: e }))
      );
      UserAggregate.mockResolvedValueOnce(groupStub().members);
      GroupFindOneAndUpdate.mockResolvedValueOnce(updatedGroup);

      const req = reqStub();
      req.body.emails.push(userNotExist, userNotInGroup);
      const res = mockRes();
      await removeFromGroup(req, res);

      expect(res.status).toBeCalledWith(200);
      expect(res.json).toBeCalledWith({
        data: {
          group: groupSchemaMapper(updatedGroup),
          notInGroup: [userNotInGroup],
          membersNotFound: [userNotExist],
        },
        refreshedTokenMessage: mockRes().locals.refreshedTokenMessage,
      });
    });
  });

  describe("deleteGroup", () => {
    beforeEach(async () => {
      jest.clearAllMocks();
    });

    const groupToRemove = groupStub().name;
    const reqStub = () => ({
      body: { name: groupToRemove },
    });

    test("gruop should be removed", async () => {
      GroupFindOneAndDelete.mockResolvedValueOnce(groupStub());

      const res = mockRes();
      await deleteGroup(reqStub(), res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    test("shold return error if group does not exist", async () => {
      GroupFindOneAndDelete.mockResolvedValueOnce();

      const res = mockRes();
      await deleteGroup(reqStub(), res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});

describe("deleteUser", () => {});
