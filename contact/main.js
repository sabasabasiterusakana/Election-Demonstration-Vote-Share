import { db } from "../firebase.js";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

window.submitInquiry = async function () {
  const name = $("inqName").value.trim();
  const email = $("inqEmail").value.trim();
  const type = $("inqType").value;
  const message = $("inqMessage").value.trim();
  const btn = $("inqSubmitBtn");

  if (!message) {
    showToast("内容を入力してください");
    return;
  }
  if (message.length < 5) {
    showToast("内容は5文字以上で入力してください");
    return;
  }

  btn.disabled = true;
  btn.textContent = "送信中...";
  try {
    await addDoc(collection(db, "inquiries"), {
      name,
      email,
      type,
      message,
      page: "contact",
      createdAt: serverTimestamp(),
      userAgent: navigator.userAgent || "",
    });
    $("inqName").value = "";
    $("inqEmail").value = "";
    $("inqType").value = "bug";
    $("inqMessage").value = "";
    showToast("送信しました");
  } catch (e) {
    console.error("submitInquiry error", e);
    showToast("送信に失敗しました");
  } finally {
    btn.disabled = false;
    btn.textContent = "送信する";
  }
};
