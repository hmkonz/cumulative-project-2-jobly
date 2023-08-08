"use strict";

/** Routes for users. */

const jsonschema = require("jsonschema");

const express = require("express");
const { ensureAdmin, ensureCorrectUserOrAdmin } = require("../middleware/auth");
const { BadRequestError } = require("../expressError");
const User = require("../models/user");
const { createToken } = require("../helpers/tokens");
const userNewSchema = require("../schemas/userNew.json");
const userUpdateSchema = require("../schemas/userUpdate.json");

const router = express.Router();


/** POST / { user }  => { user, token }
 *
 * Adds a new user. This is not the registration endpoint --- instead, this is
 * only for admin users to add new users. The new user being added can be an
 * admin.
 *
 * This returns the newly created user and an authentication token for them:
 *  {user: { username, firstName, lastName, email, isAdmin }, token }
 *
 * Authorization required: login and user logged in must be an Admin (middleware function
 * ensureCorrectUserOrAdmin checks for this)
 **/

router.post("/", ensureAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, userNewSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }

    // create a new user with the data in the requst body
    const user = await User.register(req.body); 
    const token = createToken(user);
    return res.status(201).json({ user, token }); 
  } catch (err) {
    return next(err);
  }
});

/** GET / => { users: [ {username, firstName, lastName, email }, ... ] }
 *
 * Returns list of all users.
 *
 * Authorization required: login and logged in user must be an Admin to get all users (middleware function ensureAdmin checks for this)
 **/

router.get("/", ensureAdmin, async function (req, res, next) {
  try {
      const users = await User.findAll();
      return res.json({ users });
  } catch (err) {
    return next(err);
  }
});

/** GET /[username] => { user }
 *
 * Returns { username, firstName, lastName, isAdmin }
 *
 * Authorization required: log in. Getting information on a specific user is only permitted by an admin or that user (middleware function ensureCorrectUserOrAdmin checks for this)
 **/

router.get("/:username", ensureCorrectUserOrAdmin, async function (req, res, next) {
  try {
    // retrieve the data of the specific user with the username sent in the request URL
    const user = await User.get(req.params.username);
    return res.json({ user });
  
  } catch (err) {
    return next(err);
  }
});


/** PATCH /[username] { user } => { user }
 *
 * Data can include:
 *   { firstName, lastName, password, email }
 *
 * Returns { username, firstName, lastName, email, isAdmin }
 *
 * Authorization required: log in. Updating the details of a specific user is only permitted by an admin or by that user (middleware function ensureCorrectUserOrAdmin checks for this)
 **/

router.patch("/:username", ensureCorrectUserOrAdmin, async function (req, res, next) {
  try {
    const validator = jsonschema.validate(req.body, userUpdateSchema);
    if (!validator.valid) {
      const errs = validator.errors.map(e => e.stack);
      throw new BadRequestError(errs);
    }

    // update the specific user with the username sent in the request URL with what's in the request body 
    const user = await User.update(req.params.username, req.body);
    return res.json({ user }); 

  } catch (err) {
    return next(err);
  }
});

/** DELETE /[username]  =>  { deleted: username }
 *
 * Authorization required: admin or same-user-as-:username (middleware function ensureCorrectUserOrAdmin checks for this)
 **/

router.delete("/:username", ensureCorrectUserOrAdmin, async function (req, res, next) {
  try {
    await User.remove(req.params.username);
    return res.json({ deleted: req.params.username });
  }catch (err) {
    return next(err);
  }
});

/**POST /[username]/jobs/[id]  
 * 
 * Returns {"applied": jobId}
 *
 * Authorization required: admin or same-user-as-:username (middleware function
 * ensureCorrectUserOrAdmin checks for this)
 * 
 * Allows a logged in user to apply for a job (or an admin to do it for them)
*/

router.post("/:username/jobs/:id", ensureCorrectUserOrAdmin, async function(req, res, next) {
  try {
     // Since all params are strings, unary operator (+) converts req.params.id to a number
      const jobId = +req.params.id;
      // apply the applyToJob method on User with the username and jobId in the request URL
      await User.applyToJob(req.params.username, jobId);
      return res.json({ applied: jobId });
  } catch (err) {
    return next(err);
  }

});



module.exports = router;
