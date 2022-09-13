import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { User } from "../models/userModel.js";
import ErrorHandler from "../utils/errorHandler.js";
import { instance } from "../server.js";
import crypto from "crypto";
import { Payment } from "../models/paymentModel.js";

export const buySubscription = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  if (user.role === "admin") {
    return next(new ErrorHandler("Admin can't buy subscription", 400));
  }
  const plan_id = process.env.PLAN_ID || "plan_7wAosPWtrkhqZw";
  const subscription = await instance.subscriptions.create({
    plan_id: plan_id,
    customer_notify: 1,
    total_count: 12,
  });
  user.subscription.id = subscription.id;
  user.subscription.status = subscription.status;
  await user.save();

  res.status(200).json({
    success: true,
    subscriptionId: subscription.id,
  });
});

export const paymentVerification = catchAsyncError(async (req, res, next) => {
  const { razorpay_signature, razorpay_payment_id, razorpay_susbcription_id } =
    req.body;

  const user = await User.findById(req.user._id);

  const subscriptionId = user.subscription.id;
  const generated_signature = crypto
    .createHmac("sha256", process.env.RAZOR_PAY_API_KEY)
    .update(razorpay_payment_id + "|" + subscriptionId, "utf-8")
    .digest("hex");
  const isAuthentic = generated_signature === razorpay_signature;
  if (!isAuthentic) {
    return res.redirect(`${process.env.FRONTEND_URL}/paymentfailed`);
  }
  await Payment.create({
    razorpay_signature,
    razorpay_payment_id,
    razorpay_susbcription_id,
  });
  user.subscription.status = "active";

  await user.save();

  res.redirect(
    `${process.env.FRONTEND_URL}/paymentsuccess?reference=${razorpay_payment_id}`
  );
});

export const getRazorPayKey = catchAsyncError(async (req, res, next) => {
  res.status(200).json({
    success: true,
    key: process.env.RAZOR_PAY_API_KEY,
  });
});

export const cancelSubscription = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  const subscriptionId = user.subscription.id;
  let refund = false;
  await instance.subscriptions.cancel(subscriptionId);
  const payment = await Payment.findOne({
    razorpay_susbcription_id: subscriptionId,
  });

  const gap = Date.now() - payment.createdAt();
  const refundTime = process.env.REFUND_DAYS * 24 * 60 * 60 * 1000;
  if (gap < refundTime) {
    await instance.payments.refund(payment.razorpay_payment_id);
    refund = true;
  }
  await payment.remove()
  user.subscription.is=undefined;
  user.subscription.status=undefined;
  await user.save()
  res.status(200).json({
    success: true,
    message: refund
      ? "Subscription Cancelled, You will receive full refund within 7 days"
      : "Subscription Cancelled, No refund initiated as subscription was cancelled after 7 days",
  });
});
