function storageAvailable(type) {
  try {
    var storage = window[type];
    var x = "__storage_test__";
    storage.setItem(x, x);
    storage.removeItem(x);
    return true;
  } catch (e) {
    return false;
  }
}

var tasks = [];

function loadTasks() {
  if (storageAvailable("localStorage")) {
    var storedTasks = localStorage.getItem("tasks");
    if (storedTasks) {
      tasks = JSON.parse(storedTasks);
    }
  }
}

function saveTasks() {
  localStorage.setItem("tasks", JSON.stringify(tasks));
}

function refreshTasks() {
  var list = document.getElementById("list");
  list.innerHTML = "";

  tasks.forEach(function (task, index) {
    var li = document.createElement("li");
    li.textContent = task.text;
    if (task.checked) {
      li.classList.add("checked");
    }

    var span = document.createElement("span");
    span.textContent = "\u00D7";
    span.className = "close";
    li.appendChild(span);

    span.onclick = function () {
      tasks.splice(index, 1);
      saveTasks();
      refreshTasks();
    };

    li.onclick = function () {
      task.checked = !task.checked;
      saveTasks();
      refreshTasks();
    };

    list.appendChild(li);
  });
}

function newElement() {
  var inputValue = document.getElementById("todoText").value.trim();
  if (inputValue === "") {
    alert("Tev kaut kas jāuzraksta!");
    return;
  }

  var newTask = { text: inputValue, checked: false };
  tasks.push(newTask);
  saveTasks();
  refreshTasks();

  document.getElementById("todoForm").reset();
}

function clearAllTasks() {
  tasks = [];
  localStorage.removeItem("tasks");
  refreshTasks();
}

document.addEventListener("DOMContentLoaded", function () {
  loadTasks();
  refreshTasks();
});
