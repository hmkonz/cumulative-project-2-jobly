"use strict";

const db = require("../db");
const bcrypt = require("bcrypt");
const { sqlForPartialUpdate } = require("../helpers/sql");
const {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
} = require("../expressError");

const { BCRYPT_WORK_FACTOR } = require("../config.js");

/** Related functions for users. */

class User {
  /** authenticate user with username, password.
   *
   * Returns { username, first_name, last_name, email, is_admin }
   *
   * Throws UnauthorizedError is user not found or wrong password.
   **/

  static async authenticate(username, password) {
    // try to find the user first
    const result = await db.query(
          `SELECT username,
                  password,
                  first_name AS "firstName",
                  last_name AS "lastName",
                  email,
                  is_admin AS "isAdmin"
           FROM users
           WHERE username = $1`,
        [username],
    );

    const user = result.rows[0];

    if (user) {
      // if user is in the database, compare hashed password in db to a new hash from password entered in req.body
      const isValid = await bcrypt.compare(password, user.password);
      if (isValid === true) {
        // for security, delete the logged in user's password
        delete user.password;
        return user;
      }
    }

    // Throws UnauthorizedError is user not found or wrong password
    throw new UnauthorizedError("Invalid username/password");
  }

  /** Register user with data sent in request.body.
   *
   * Returns { username, firstName, lastName, email, isAdmin }
   *
   * Throws BadRequestError on duplicates.
   **/

  static async register(
      { username, password, firstName, lastName, email, isAdmin }) {
    // make sure username sent in request.body is not already in the database
    const duplicateCheck = await db.query(
          `SELECT username
           FROM users
           WHERE username = $1`,
        [username],
    );

    if (duplicateCheck.rows[0]) {
      throw new BadRequestError(`Duplicate username: ${username}`);
    }

    // hash the password sent in request.body
    const hashedPassword = await bcrypt.hash(password, BCRYPT_WORK_FACTOR);

    // create a new user by inserting the data in req.body into the users table 
    const result = await db.query(
          `INSERT INTO users
           (username,
            password,
            first_name,
            last_name,
            email,
            is_admin)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING username, first_name AS "firstName", last_name AS "lastName", email, is_admin AS "isAdmin"`,
        [
          username,
          hashedPassword,
          firstName,
          lastName,
          email,
          isAdmin,
        ],
    );

    const user = result.rows[0];

    return user;
  }

  /** Find all users.
   *
   * Returns [{ username, first_name, last_name, email, is_admin }, ...]
   **/

  static async findAll() {
    const result = await db.query(
          `SELECT username,
                  first_name AS "firstName",
                  last_name AS "lastName",
                  email,
                  is_admin AS "isAdmin"
           FROM users
           ORDER BY username`,
    );

    return result.rows;
  }

  /** Given a username, return data about user.
   *
   * Returns { username, first_name, last_name, email, is_admin, jobs: [ jobId, jobId, ... ] }
   *
   * Throws NotFoundError if user not found.
   **/

  static async get(username) {
    // retrieve the user data of 'username' sent in the request URL
    const userRes = await db.query(
          `SELECT username,
                  first_name AS "firstName",
                  last_name AS "lastName",
                  email,
                  is_admin AS "isAdmin"
           FROM users
           WHERE username = $1`,
        [username],
    );

    const user = userRes.rows[0];

    // for GET /users/BlossBloss:
    // user = {
    //   username: 'BlossBloss',
    //   firstName: 'Blossom',
    //   lastName: 'Konz',
    //   isAdmin: true
    // }

    if (!user) throw new NotFoundError(`No user: ${username}`);

    // retrieve the applications associated with the username sent in request URL
    // i.e. userApplicationRes.rows = [ { job_id: 1 }, { job_id: 25 } ]
    const userApplicationsRes = await db.query(
          `SELECT job_id
           FROM applications 
           WHERE username = $1`, [username]);
 
    // map over userApplicationRs.rows (i.e. [ { job_id: 1 }, { job_id: 25 } ]) and add only the values of the key/value pairs to the resulting array
    // assign the propery 'jobs' to user and set it equal to the resulting array after mapping userApplicationRes.rows
    user.jobs = userApplicationsRes.rows.map(a => a.job_id);
    // i.e. user.jobs =  [ 1, 25 ]

    return user;
    // i.e. user = 
    // {
    //   username: 'BlossBloss',
    //   firstName: 'Blossom',
    //   lastName: 'Konz',
    //   isAdmin: true,
    //   jobs: [ 1, 25 ]
    // }
  }

  /** Update user data with `data`.
   *
   * This is a "partial update" --- it's fine if data doesn't contain
   * all the fields; this only changes provided ones.
   *
   * Data can include:
   *   { firstName, lastName, password, email, isAdmin }
   *
   * Returns { username, firstName, lastName, email, isAdmin }
   *
   * Throws NotFoundError if not found.
   *
   * WARNING: this function can set a new password or make a user an admin.
   * Callers of this function must be certain they have validated inputs to this
   * or a serious security risks are opened.
   */

  static async update(username, data) {
    // if password is sent in req.body, reset the password by hashing it 
    if (data.password) {
      data.password = await bcrypt.hash(data.password, BCRYPT_WORK_FACTOR);
    }

    // setCols equals "first_name"=$1, "last_name"=$2, "email"=$3, "is_admin"=$4
    // values = data in request body i.e. [ 'Blossom', 'Konz', 'blossomk@gmail.com', true ]
    const { setCols, values } = sqlForPartialUpdate(
        data,
        {
          firstName: "first_name",
          lastName: "last_name",
          isAdmin: "is_admin",
        });
    
    // set column for where expression. usernameVarIdx: "username" = $5
    const usernameVarIdx = "$" + (values.length + 1);

    // create the SQL query for updating the users table
    const querySql = `UPDATE users 
                      SET ${setCols} 
                      WHERE username = ${usernameVarIdx} 
                      RETURNING username,
                                first_name AS "firstName",
                                last_name AS "lastName",
                                email,
                                is_admin AS "isAdmin"`;

    // retrieve the results of the query above with the values in the request body 'values' and 'username' from the request URL passed in
    const result = await db.query(querySql, [...values, username]);
    const user = result.rows[0];

    if (!user) throw new NotFoundError(`No user: ${username}`);

    delete user.password;
    return user;
  }

  /** Delete given user from database; returns undefined. */

  static async remove(username) {
    let result = await db.query(
          `DELETE
           FROM users
           WHERE username = $1
           RETURNING username`,
        [username],
    );
    const user = result.rows[0];

    if (!user) throw new NotFoundError(`No user: ${username}`);
  }

  /** Apply for job: update db, returns undefined.
   *
   * - username: username applying for job
   * - jobId: job id
   **/

  static async applyToJob(username, jobId) {
    // retrieve the job from the database with jobId passed in from req.params in route URL
    const preCheck = await db.query(
          `SELECT id
           FROM jobs
           WHERE id = $1`, [jobId]);
    const job = preCheck.rows[0];
    
    // if there is no job with jobId, throw an error
    if (!job) throw new NotFoundError(`No job: ${jobId}`);

    // retrieve the user from the database with username passed in from req.params in route URL
    const preCheck2 = await db.query(
          `SELECT username
           FROM users
           WHERE username = $1`, [username]);
    const user = preCheck2.rows[0];
   
    // if there is no user with username, throw an error
    if (!user) throw new NotFoundError(`No username: ${username}`);

    // insert into the applications table the job_id and username with 'jobId' and 'username' that was passed in to this method
    await db.query(
          `INSERT INTO applications (job_id, username)
           VALUES ($1, $2)`,
        [jobId, username]);
  }
}


module.exports = User;
