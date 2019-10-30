import {
    IAssignmentLink,
    ISubmission,
    IUserRelation,
} from "../models";

import { Assignment, Course, Enrollment, Group, Organization, Repository, Status, User, Void } from "../../proto/ag_pb";
import { ILogger } from "./LogManager";

export interface ICourseProvider {
    getCourses(): Promise<Course[]>;
    getAssignments(courseID: number): Promise<Assignment[]>;
    getCoursesFor(user: User, state?: Enrollment.UserStatus[]): Promise<Enrollment[]>;
    getUsersForCourse(course: Course, noGroupMemebers?: boolean, state?: Enrollment.UserStatus[]):
        Promise<Enrollment[]>;

    addUserToCourse(user: User, course: Course): Promise<boolean>;
    changeUserState(link: Enrollment, state: Enrollment.UserStatus): Promise<boolean>;
    approveAll(courseID: number): Promise<boolean>;

    createNewCourse(courseData: Course): Promise<Course | Status>;
    getCourse(id: number): Promise<Course | null>;
    updateCourse(courseID: number, courseData: Course): Promise<Void | Status>;

    getCourseGroups(courseID: number): Promise<Group[]>;
    updateGroupStatus(groupID: number, status: Group.GroupStatus): Promise<boolean>;
    createGroup(name: string, users: number[], courseId: number): Promise<Group | Status>;
    getGroup(groupID: number): Promise<Group | null>;
    deleteGroup(groupID: number): Promise<boolean>;
    getGroupByUserAndCourse(userid: number, courseid: number): Promise<Group | null>;
    updateGroup(groupData: Group): Promise<Status>;

    getAllLabInfos(courseID: number, userId: number): Promise<ISubmission[]>;
    getAllGroupLabInfos(courseID: number, groupID: number): Promise<ISubmission[]>;
    getOrganization(orgName: string): Promise<Organization | Status >;
    getProviders(): Promise<string[]>;
    updateAssignments(courseID: number): Promise<boolean>;
    approveSubmission(submissionID: number, courseID: number): Promise<boolean>;
    refreshSubmission(id: number): Promise<boolean>;
    getRepositories(cid: number, types: Repository.Type[]): Promise<Map<Repository.Type, string>>;
}

export class CourseManager {
    private courseProvider: ICourseProvider;

    constructor(courseProvider: ICourseProvider, logger: ILogger) {
        this.courseProvider = courseProvider;
    }

    /**
     * Adds a user to a course
     * @param user The user to be added to a course
     * @param course The course the user should be added to
     * @returns True if succeeded and false otherwise
     */
    public async addUserToCourse(user: User, course: Course): Promise<boolean> {
        return this.courseProvider.addUserToCourse(user, course);
    }

    /**
     * Get a course from and id
     * @param ID The id of the course
     */
    public async getCourse(ID: number): Promise<Course | null> {
        return this.courseProvider.getCourse(ID);
    }

    /**
     * Get all the courses available at the server
     */
    public async getCourses(): Promise<Course[]> {
        return this.courseProvider.getCourses();
    }

    public async getCoursesWithState(user: User): Promise<IAssignmentLink[]> {
        const userCourses = await this.courseProvider.getCoursesFor(user);
        const newMap: IAssignmentLink[] = [];
        userCourses.forEach((ele) => {
            const crs = ele.getCourse();
            if (crs) {
                newMap.push({
                    assignments: [],
                    course: crs,
                    link: ele,
                });
            }
        });
        return newMap;
    }

    /**
     * Get all courses related to a user
     * @param user The user to get courses to
     * @param state Optional. The state the relations should be in, all if not present
     */
    public async getCoursesFor(user: User, state?: Enrollment.UserStatus[]): Promise<Course[]> {
        const courses: Course[] = [];
        const enrolList = await this.courseProvider.getCoursesFor(user, state);
        enrolList.forEach((ele) => {
            const crs = ele.getCourse();
            if (crs) {
                courses.push(crs);
            }
        });
        return courses;
    }

    /**
     * Get all assignments in a single course
     * @param courseID The course id or ICourse to retrive assignments from
     */
    public async getAssignments(courseID: number): Promise<Assignment[]> {
        return this.courseProvider.getAssignments(courseID);
    }

    /**
     * Change the userstate for a relation between a course and a user
     * @param link The link to change state of
     * @param state The new state of the relation
     */
    public async changeUserState(link: Enrollment, state: Enrollment.UserStatus): Promise<boolean> {
        const ans = await this.courseProvider.changeUserState(link, state);
        return ans;
    }

    public async approveAll(courseID: number): Promise<boolean> {
        return this.courseProvider.approveAll(courseID);
    }

    /**
     * Creates a new course in the backend
     * @param courseData The course information to create a course from
     */
    public async createNewCourse(courseData: Course): Promise<Course | Status> {
        return this.courseProvider.createNewCourse(courseData);
    }

    /**
     * Updates a course with new information
     * @param courseData The new information for the course
     */
    public async updateCourse(courseID: number, courseData: Course): Promise<Void | Status> {
        return this.courseProvider.updateCourse(courseID, courseData);
    }

    /**
     * Load an IAssignmentLink object for a single user and a single course
     * @param student The student the information should be retrived from
     * @param course The course the data should be loaded for
     */
    public async getStudentCourseForTeacher(student: IUserRelation, course: Course, assignments: Assignment[]):
        Promise<IAssignmentLink | null> {
        const enrol = new Enrollment();
        enrol.setUserid(student.user.getId());
        enrol.setUser(student.user);
        enrol.setCourseid(course.getId());
        enrol.setCourse(course);
        enrol.setStatus(student.link.getStatus());

        const userCourse: IAssignmentLink = {
            link: enrol,
            assignments: [],
            course,
        };
        await this.fillLinks(student.user, userCourse, assignments);
        return userCourse;
    }

    /**
     * Retrives all course relations, and courses related to a
     * a single student
     * @param student The student to load the information for
     */
    public async getStudentCourses(student: User, state?: Enrollment.UserStatus[]): Promise<IAssignmentLink[]> {
        const links: IAssignmentLink[] = [];
        const enrols = await this.courseProvider.getCoursesFor(student, state);
        for (const enrol of enrols) {
            const crs = enrol.getCourse();
            if (crs) {
                links.push({
                    assignments: [],
                    course: crs,
                    link: enrol,
                });
            }
        }
        for (const link of links) {
            await this.fillLinks(student, link);
        }
        return links;
    }

    /**
     * Retrives all users related to a single course
     * @param course The course to retrive userinformation to
     * @param state Optional. The state of the user to course relation
     */
    public async getUsersForCourse(
        course: Course,
        noGroupMemebers?: boolean,
        state?: Enrollment.UserStatus[]): Promise<IUserRelation[]> {
        const userlinks: IUserRelation[] = [];
        const enrolls = await this.courseProvider.getUsersForCourse(course, noGroupMemebers, state);
        enrolls.forEach((ele) => {
            const usr = ele.getUser();
            if (usr) {
                ele.setCourseid(course.getId());
                userlinks.push({
                    link: ele,
                    user: usr,
                });
            }

        });
        return userlinks;
    }

    public async createGroup(name: string, users: number[], courseID: number): Promise<Group | Status> {
        return this.courseProvider.createGroup(name, users, courseID);
    }

    public async updateGroup(groupData: Group): Promise<Status> {
        return this.courseProvider.updateGroup(groupData);
    }

    /**
     * getCourseGroup returns all the groups under a course
     * @param courseID course id of a course
     */
    public async getCourseGroups(courseID: number): Promise<Group[]> {
        return this.courseProvider.getCourseGroups(courseID);
    }

    /**
     * Load an IAssignmentLink object for a single group and a single course
     * @param group The group the information should be retrived from
     * @param course The course the data should be loaded for
     */
    public async getGroupCourse(group: Group, course: Course): Promise<IAssignmentLink | null> {
        // Fetching group enrollment status
        if (group.getCourseid() === course.getId()) {
            const enrol = new Enrollment();
            enrol.setGroupid(group.getId());
            enrol.setCourseid(course.getId());
            enrol.setGroup(group);
            const groupCourse: IAssignmentLink = {
                link: enrol,
                assignments: [],
                course,
            };
            await this.fillLinksGroup(group, groupCourse);
            return groupCourse;
        }
        return null;
    }

    public async getGroupCourseForTeacher(group: Group, course: Course, assignments: Assignment[]):
        Promise<IAssignmentLink | null> {
        // Fetching group enrollment status
        if (group.getCourseid() === course.getId()) {
            const enrol = new Enrollment();
            enrol.setGroupid(group.getId());
            enrol.setCourseid(course.getId());
            enrol.setGroup(group);
            const groupCourse: IAssignmentLink = {
                link: enrol,
                assignments: [],
                course,
            };
            await this.fillLinksGroup(group, groupCourse, assignments);
            return groupCourse;
        }
        return null;
    }

    public async getGroupByUserAndCourse(userID: number, courseID: number): Promise<Group | null> {
        return this.courseProvider.getGroupByUserAndCourse(userID, courseID);
    }

    public async updateGroupStatus(groupID: number, status: Group.GroupStatus): Promise<boolean> {
        return this.courseProvider.updateGroupStatus(groupID, status);
    }

    public async getGroup(groupID: number): Promise<Group | null> {
        return this.courseProvider.getGroup(groupID);
    }

    public async deleteGroup(groupID: number): Promise<boolean> {
        return this.courseProvider.deleteGroup(groupID);
    }

    /**
     * updateAssignments updates the assignments on the backend database
     * for the given course. The assignment data is collected from the
     * assignment.yml files found in the course's tests repository; there
     * should be one assignment.yml file per lab assignment.
     * @param courseID course whose assignment to update
     */
    public async updateAssignments(courseID: number): Promise<boolean> {
        return this.courseProvider.updateAssignments(courseID);
    }

    public async getOrganization(orgName: string): Promise<Organization | Status> {
        return this.courseProvider.getOrganization(orgName);
    }

    /**
     * Get all available directories or organisations for a single provider
     * @param provider The provider to load information from, for instance github og gitlab
     */
    public async getProviders(): Promise<string[]> {
        return this.courseProvider.getProviders();
    }

    public async getRepositories(cid: number, types: Repository.Type[]): Promise<Map<Repository.Type, string>> {
        return this.courseProvider.getRepositories(cid, types);
    }

    public async refreshSubmission(id: number): Promise<boolean> {
        return this.courseProvider.refreshSubmission(id);
    }

    public async approveSubmission(submissionID: number, courseID: number): Promise<boolean> {
        return this.courseProvider.approveSubmission(submissionID, courseID);
    }

    /**
     * Add IStudentSubmissions to an IAssignmentLink
     * @param student The student
     * @param studentCourse The student course
     */
    private async fillLinks(student: User, studentCourse: IAssignmentLink, assignments?: Assignment[]): Promise<void> {
        if (!studentCourse.link) {
            return;
        }
        if (!assignments) {
            assignments = await this.getAssignments(studentCourse.course.getId());
        }
        if (assignments.length > 0) {
            const submissions =
                await this.courseProvider.getAllLabInfos(studentCourse.course.getId(), student.getId());

            for (const a of assignments) {
                const submission = submissions.find((sub) => sub.assignmentid === a.getId());
                studentCourse.assignments.push({ assignment: a, latest: submission, authorName: student.getName() });
            }
        }
    }

    /**
     * Add IStudentSubmissions to an IAssignmentLink
     * @param group The group
     * @param groupCourse The group course
     */
    private async fillLinksGroup(group: Group, groupCourse: IAssignmentLink, assignments?: Assignment[]):
        Promise<void> {
        if (!groupCourse.link) {
            return;
        }
        if (!assignments) {
            assignments = await this.getAssignments(groupCourse.course.getId());
        }
        if (assignments.length > 0) {
            const submissions =
                await this.courseProvider.getAllGroupLabInfos(groupCourse.course.getId(), group.getId());

            for (const a of assignments) {
                const submission = submissions.find((sub) => sub.assignmentid === a.getId());
                groupCourse.assignments.push({ assignment: a, latest: submission, authorName: group.getName() });
            }
        }
    }
}
