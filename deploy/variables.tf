variable "instances" {
  type = list(object({
    type  = string
    count = number
  }))
  default = [
  ]
}

variable "region" {
  type    = string
  default = "fra1"
}
