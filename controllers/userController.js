import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import ErrroHandler from "../utils/errorHandler.js";
import { User } from "../models/userModel.js";
import { sendToken } from "../utils/sendToken.js";
import ErrorHandler from "../utils/errorHandler.js";
import { sendEmail } from "../utils/sendEmail.js";
import crypto from "crypto";
import getdataUri from "../utils/dataUri.js";
import { Course } from "../models/courseModel.js";
import cloudinary from "cloudinary";
import { Stats } from "../models/statsModel.js";
export const register = catchAsyncError(async (req, res, next) => {
  const { name, email, password } = req.body;
  // const file=req.file;

  if (!name || !email || !password) {
    return next(new ErrroHandler("Please enter a All fields", 400));
  }
  let user = await User.findOne({ email });
  if (user) {
    return next(new ErrroHandler("User already exists", 409));
  }
  // UPLOAD FILE OMN CLOUDINARY
  const file = req.file;
  const fileUri = getdataUri(file);

  const mycloud = await cloudinary.v2.uploader.upload(fileUri.content);

  user = await User.create({
    name,
    email,
    password,
    avatar: {
      public_id: mycloud.public_id,
      url: mycloud.secure_url,
    },
  });
  sendToken(res, user, "Registered Successfully", 201);
});

export const login = catchAsyncError(async (req, res, next) => {
  const { email, password } = req.body;
  // const file=req.file;

  if (!email || !password) {
    return next(new ErrroHandler("Please enter a All fields", 400));
  }
  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    return next(new ErrroHandler("User doesn't exist", 409));
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return next(new ErrroHandler("Incorrect details", 409));
  }
  sendToken(res, user, `Login Successfully, ${user.name}`, 201);
});

export const logout = catchAsyncError(async (req, res, next) => {
  res
    .status(200)
    .cookie("token", null, {
      expires: new Date(Date.now()),
    })
    .json({
      success: true,
      message: "Logged Out Successfully",
    });
});

export const getMyProfile = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  res.status(200).json({
    success: true,
    user,
  });
});

export const changePassword = catchAsyncError(async (req, res, next) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return next(new ErrroHandler("Please enter a All fields", 400));
  }
  const user = await User.findById(req.user._id);
  if (!user) {
    return next(new ErrroHandler("User doesn't exist", 409));
  }

  const isMatch = await user.comparePassword(oldPassword);
  if (!isMatch) {
    return next(new ErrroHandler("Incorrect details", 409));
  }
  user.password = newPassword;
  await user.save();
  res.status(200).json({
    success: true,
    message: "Password updated successfully",
    user,
  });
});

export const updateProfile = catchAsyncError(async (req, res, next) => {
  const { name, email } = req.body;
  const user = await User.findById(req.user._id).select("+password");
  if (name) user.name = name;
  if (email) user.email = email;

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    user,
  });
});

export const updateProfilePicture = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  const file = req.file;
  const fileUri = getdataUri(file);

  const mycloud = await cloudinary.v2.uploader.upload(fileUri.content);

  await cloudinary.v2.uploader.destroy(user.avatar.public_id);
  user.avatar = {
    public_id: mycloud.public_id,
    url: mycloud.secure_url,
  };
  await user.save();
  res.status(200).json({
    success: true,
    message: "Profile Picture updated successfully",
  });
});

export const forgetPassword = catchAsyncError(async (req, res, next) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    return next(new ErrorHandler("User not found", 400));
  }
  const resetToken = await user.getResetToken();

  await user.save();

  const url = `${process.env.FRONTEND_URL}/resetpassword/${resetToken}`;
  const message = `Click on the link to reset your password. ${url}. if you have not requested then please ignore`;
  await sendEmail(user.email, `Education App Reset Password`, message);

  res.status(200).json({
    success: true,
    message: `Reset Token has been sent to ${email}`,
  });
});

export const resetPassword = catchAsyncError(async (req, res, next) => {
  const { token } = req.params;
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: {
      $gt: Date.now(),
    },
  });
  if (!user) {
    return next(new ErrorHandler("Token is invalid or has been expires", 404));
  }
  user.password = req.body.password;
  user.resetPasswordExpire = undefined;
  user.resetPasswordToken = undefined;

  await user.save();

  res.status(200).json({
    success: true,
    message: "Password changed successfully",
    user,
  });
});

export const addToPlaylist = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  const course = await Course.findById(req.body.id);
  if (!course) {
    return next(new ErrorHandler("Invalid Course ID", 404));
  }

  const itemExist = user.playlist.find((item) => {
    if (item.course.toString() === course._id.toString()) {
      return true;
    }
  });

  if (itemExist) {
    return next(new ErrorHandler("Course already exists", 409));
  }
  user.playlist.push({
    course: course._id,
    poster: course.poster.url,
  });
  await user.save();

  res.status(200).json({
    success: true,
    message: "Added To Playlist",
    user,
  });
});

export const removeFromPlaylist = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  const course = await Course.findById(req.query.id);
  if (!course) {
    return next(new ErrorHandler("Invalid Course ID", 404));
  }
  const newPlaylist = user.playlist.filter((item) => {
    if (item.course.toString() !== course._id.toString()) {
      return item;
    }
  });
  user.playlist = newPlaylist;
  await user.save();
  res.status(200).json({
    success: true,
    message: "Removed From Playlist",
    user,
  });
});

export const getAllUsers = catchAsyncError(async (req, res, next) => {
  const users = await User.find();
  res.status(200).json({
    success: true,
    users,
  });
});

export const updateUserRole = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new ErrorHandler("User not found", 404));
  }
  if (user.role === "user") {
    user.role = "admin";
  } else {
    user.role = "user";
  }
  await user.save();
  res.status(200).json({
    success: true,
    message: "Role Updated successfully",
  });
});

export const deleteUser = catchAsyncError(async (req, res, next) => {
  const users = await User.find();
  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new ErrorHandler("User not found", 404));
  }
  await cloudinary.v2.uploader.destroy(user.avatar.public_id);
  await user.remove();
  res.status(200).json({
    success: true,
    message: "User Deleted successfully",
  });
});

export const deleteMyProfile = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  await cloudinary.v2.uploader.destroy(user.avatar.public_id);
  await user.remove();
  res
    .status(200)
    .cookies("token", null, {
      expires: new Date(Date.now()),
    })
    .json({
      success: true,
      message: "User Deleted successfully",
    });
});

User.watch().on("change", async () => {
  const stats = await Stats.find({}).sort({ createdAt: "desc" }).limit(1);
  const subscription = await User.find({ "subscription.status": "active" });
  stats[0].users = await User.countDocuments();
  stats[0].subscriptions = subscription.length;
  stats[0].createdAt = new Date(Date.now());
  await stats[0].save();
});
